import { NextRequest } from "next/server";
import { canUse, deductQuota, canUseByIp, deductByIp } from "@/lib/quota-store";

export const runtime = "edge";

// ========== 模型配置 ==========
const TEXT_MODEL = "gemini-3-pro-preview-thinking-high";
const IMAGE_MODEL = "gemini-3-pro-image";

// ========== System Prompts ==========
const SYSTEM_PROMPTS: Record<string, string> = {
  none: "你是 OpenSpeech AI 助手。请用中文回答，除非用户使用其他语言。回复使用 Markdown 格式。",
  "deep-think": "你是一个 AI 助手。请深入思考用户的问题，展示你的推理过程，给出严谨、全面的回答。使用 Markdown 格式。",
  "deep-research": `你是一个深度研究助手。基于搜索结果全面分析问题：
1. 综合多个来源的信息
2. 提供结构化的研究报告（使用标题、列表、表格）
3. 引用数据来源
4. 在末尾给出进一步研究建议
请用中文回答，使用 Markdown 格式。`,
  "image-gen": "Generate an image based on the user's description. Be creative and produce high-quality visuals.",
  canvas: `你是一个创意写作和文档助手。帮助用户：
1. 撰写和编辑各类文档（文章、邮件、报告、小说等）
2. 提供写作建议和优化
3. 保持专业的写作风格
请直接输出优化后的内容，使用 Markdown 格式。`,
  tutor: `你是一个耐心的学习辅导助手。你需要：
1. 用通俗易懂的语言解释概念
2. 提供循序渐进的学习指导
3. 使用例子和类比帮助理解
4. 鼓励学生思考，适时提出练习问题
请用 Markdown 格式组织回答。`,
  "code-assist": `你是一个专业的编程助手。你擅长：
1. 代码生成、调试、重构、优化
2. 多语言支持（Python, JavaScript, TypeScript, Go, Rust, Java 等）
3. 解释代码逻辑和算法
4. 最佳实践和设计模式建议
所有代码必须用 Markdown 代码块包裹并标注语言。`,
  notebook: `你是一个文档分析助手（类似 NotebookLM）。你需要：
1. 仔细阅读用户上传的文档内容
2. 提供准确的摘要和关键要点
3. 回答关于文档的问题
4. 生成思维导图/大纲结构
5. 发现文档中的关联和模式
请基于文档内容回答，不要编造文档中没有的信息。`,
};

// ========== Helper: 构建 4sapi 请求 headers ==========
function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

// ========== Helper: 构建 API contents 数组 ==========
function buildContents(messages: any[]) {
  return messages.map((msg) => {
    const parts: any[] = [];
    if (msg.content) {
      parts.push({ text: msg.content });
    }
    if (msg.attachments) {
      for (const att of msg.attachments) {
        if (
          att.mimeType.startsWith("image/") ||
          att.mimeType.startsWith("audio/") ||
          att.mimeType.startsWith("video/")
        ) {
          const base64 = att.url.split(",")[1];
          if (base64) {
            parts.push({
              inline_data: { mime_type: att.mimeType, data: base64 },
            });
          }
        }
      }
    }
    return { role: msg.role === "assistant" ? "model" : "user", parts };
  });
}

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

// ========== 图片生成 (non-streaming) ==========
async function handleImageGen(messages: any[], apiBase: string, apiKey: string) {
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
  const rawPrompt = lastUserMsg?.content || "A beautiful landscape";

  const apiUrl = `${apiBase}/v1beta/models/${IMAGE_MODEL}:generateContent`;

  // 检查是否有图片附件（图片编辑模式）
  const hasImageAttachment = lastUserMsg?.attachments?.some(
    (att: any) => att.mimeType.startsWith("image/")
  );

  // 构建 parts：文本 + 可能的图片附件（用于图片编辑）
  const imageGenPrefix = "Please generate an IMAGE (not code, not text) based on this request: ";
  const parts: any[] = [{ text: hasImageAttachment ? rawPrompt : imageGenPrefix + rawPrompt }];
  if (lastUserMsg?.attachments) {
    for (const att of lastUserMsg.attachments) {
      if (att.mimeType.startsWith("image/")) {
        const base64 = att.url.split(",")[1];
        if (base64) {
          parts.push({
            inline_data: { mime_type: att.mimeType, data: base64 },
          });
        }
      }
    }
  }

  // 有附件时用 TEXT+IMAGE（支持图片编辑+说明），否则强制 IMAGE only
  const responseModalities = hasImageAttachment ? ["TEXT", "IMAGE"] : ["IMAGE"];

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities,
    },
    safetySettings: SAFETY_SETTINGS,
  };

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return new Response(
      JSON.stringify({ error: `图片生成失败: ${resp.status}`, details: errText }),
      { status: resp.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const respParts = candidate?.content?.parts || [];

  // 检查是否被安全过滤
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "BLOCKED") {
    return new Response(
      JSON.stringify({ error: "图片被安全策略拦截，请调整描述后重试" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const result: { text?: string; images: string[] } = { images: [] };
  for (const part of respParts) {
    if (part.text) result.text = part.text;
    // 4sapi 可能返回 inlineData 或 inline_data
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData) {
      const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
      result.images.push(`data:${mimeType};base64,${inlineData.data}`);
    }
  }

  // 如果强制 IMAGE 模式但没得到图片，降级用 TEXT+IMAGE 再试一次
  if (result.images.length === 0 && !hasImageAttachment) {
    const fallbackBody = {
      contents: [{ role: "user", parts: [{ text: rawPrompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      safetySettings: SAFETY_SETTINGS,
    };
    const fallbackResp = await fetch(apiUrl, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(fallbackBody),
    });
    if (fallbackResp.ok) {
      const fbData = await fallbackResp.json();
      const fbParts = fbData?.candidates?.[0]?.content?.parts || [];
      for (const part of fbParts) {
        if (part.text) result.text = part.text;
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData) {
          const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
          result.images.push(`data:${mimeType};base64,${inlineData.data}`);
        }
      }
    }
  }

  if (result.images.length === 0 && !result.text) {
    return new Response(
      JSON.stringify({ error: "未能生成图片，请尝试用更简单的描述重试" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}

// ========== 流式聊天 (with thinking / search grounding) ==========
async function handleStreamingChat(
  messages: any[],
  tool: string,
  apiBase: string,
  apiKey: string,
  options?: {
    gemSystemPrompt?: string;
    customSystemInstruction?: string;
    generationConfig?: {
      temperature?: number;
      topP?: number;
      topK?: number;
      maxOutputTokens?: number;
      thinkingBudget?: number;
    };
  }
) {
  const contents = buildContents(messages);

  // 优先级：customSystemInstruction > gemSystemPrompt > 工具默认 prompt
  const systemInstruction =
    options?.customSystemInstruction ||
    options?.gemSystemPrompt ||
    SYSTEM_PROMPTS[tool] ||
    SYSTEM_PROMPTS.none;

  // 合并前端传来的 generationConfig
  const userConfig = options?.generationConfig;
  const generationConfig: any = {
    temperature: userConfig?.temperature ?? (tool === "code-assist" ? 0.3 : 0.8),
    topP: userConfig?.topP ?? 0.95,
    topK: userConfig?.topK ?? 40,
    maxOutputTokens: userConfig?.maxOutputTokens ?? 16384,
  };

  // thinking 模型始终启用 thinkingConfig，确保正确分离思考和输出
  // deep-think 工具给更高的思考预算
  const thinkingBudget = tool === "deep-think"
    ? (userConfig?.thinkingBudget ?? 16384)
    : (userConfig?.thinkingBudget ?? 4096);
  generationConfig.thinkingConfig = { thinkingBudget };

  const requestBody: any = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig,
    safetySettings: SAFETY_SETTINGS,
  };

  // Deep Research: 添加 Google Search grounding
  if (tool === "deep-research") {
    requestBody.tools = [{ google_search: {} }];
  }

  // 使用流式端点
  const apiUrl = `${apiBase}/v1beta/models/${TEXT_MODEL}:streamGenerateContent?alt=sse`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    return new Response(
      JSON.stringify({ error: `API 请求失败: ${response.status}`, details: errText }),
      { status: response.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data);
              const candidate = json?.candidates?.[0];
              if (!candidate) continue;

              const parts = candidate?.content?.parts || [];

              for (const part of parts) {
                // Thinking content (thought part)
                if (part.thought === true && part.text) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ thinking: part.text })}\n\n`
                    )
                  );
                }
                // Regular text
                else if (part.text && !part.thought) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ text: part.text })}\n\n`
                    )
                  );
                }
                // Inline image in response
                else if (part.inlineData || part.inline_data) {
                  const inlineData = part.inlineData || part.inline_data;
                  const mimeType =
                    inlineData.mimeType || inlineData.mime_type || "image/png";
                  const imgData = `data:${mimeType};base64,${inlineData.data}`;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ image: imgData })}\n\n`
                    )
                  );
                }
              }

              // Grounding metadata (search sources)
              const grounding = candidate?.groundingMetadata;
              if (grounding?.groundingChunks) {
                const sources = grounding.groundingChunks
                  .filter((c: any) => c.web)
                  .map((c: any) => ({
                    title: c.web.title || c.web.uri,
                    url: c.web.uri,
                  }));
                if (sources.length > 0) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ sources })}\n\n`
                    )
                  );
                }
              }

              // Token usage metadata
              const usage = json?.usageMetadata;
              if (usage) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      tokenCount: {
                        input: usage.promptTokenCount || 0,
                        output: usage.candidatesTokenCount || usage.totalTokenCount || 0,
                      },
                    })}\n\n`
                  )
                );
              }
            } catch {
              // skip invalid JSON
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        );
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ========== Main Handler ==========
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      tool = "none",
      gemSystemPrompt,
      generationConfig: userGenConfig,
      customSystemInstruction,
      userApiKey,
      userId,
    } = body;

    const isImageGen = tool === "image-gen";
    const usageType = isImageGen ? "image" as const : "chat" as const;

    // API 地址仅从服务端配置读取
    const apiBase = process.env.AI_API_BASE || process.env.GEMINI_API_BASE || "https://4sapi.com";

    let apiKey = "";
    let usingOwnKey = false;

    if (userApiKey && userApiKey !== "your-api-key-here") {
      // 用户自带 Key，直接使用，不限额
      apiKey = userApiKey;
      usingOwnKey = true;
    } else {
      // 使用平台 Key，需要检查配额
      apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "请先配置 API Key 或兑换体验卡", details: "请在「设置」中填入 API Key 或兑换码" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // 获取客户端 IP
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

      let isPaidUser = false;

      // 检查用户配额（userId 级别）
      if (userId) {
        const check = await canUse(userId, usageType);
        if (!check.allowed) {
          return new Response(
            JSON.stringify({ error: check.reason || "额度不足", quotaExhausted: true }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        isPaidUser = check.quota.plan !== "free";
      }

      // 免费用户始终检查 IP 级别额度（防止换 userId 绕过）
      if (!isPaidUser) {
        const ipAllowed = await canUseByIp(clientIp);
        if (!ipAllowed) {
          return new Response(
            JSON.stringify({ error: "今日免费额度已用完", quotaExhausted: true }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 图片生成使用非流式端点 + 图片模型
    let response: Response;
    if (isImageGen) {
      response = await handleImageGen(messages, apiBase, apiKey);
    } else {
      response = await handleStreamingChat(messages, tool, apiBase, apiKey, {
        gemSystemPrompt,
        customSystemInstruction,
        generationConfig: userGenConfig,
      });
    }

    // 请求成功后扣减配额（仅平台 Key 用户）
    if (!usingOwnKey && userId && response.ok) {
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
      // 异步扣减 userId + IP 两个维度
      Promise.all([
        deductQuota(userId, usageType),
        deductByIp(clientIp),
      ]).catch((err) => console.error("[deductQuota error]", err));
    }

    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "服务器内部错误", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
