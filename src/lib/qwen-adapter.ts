// 通义千问 API 适配器
// 将 Gemini 格式的请求转换为通义千问格式

interface QwenMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image?: string }>;
}

interface QwenRequest {
  model: string;
  messages: QwenMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

// 通义千问模型映射
const QWEN_MODELS = {
  text: "qwen3.5-plus", // Qwen3.5-Plus 模型
  image: "qwen-vl-max", // 对应 Gemini image-gen（多模态理解，不支持生图）
};

export async function callQwenAPI(
  apiKey: string,
  messages: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; url: string }> }>,
  tool: string,
  systemPrompt?: string,
  generationConfig?: { temperature?: number; topP?: number; maxOutputTokens?: number },
  stream: boolean = true
): Promise<Response> {
  const model = tool === "image-gen" ? QWEN_MODELS.image : QWEN_MODELS.text;

  // 转换消息格式
  const qwenMessages: QwenMessage[] = [];

  // 添加系统提示词
  if (systemPrompt) {
    qwenMessages.push({ role: "system", content: systemPrompt });
  }

  // 转换用户消息
  for (const msg of messages) {
    if (msg.attachments && msg.attachments.length > 0) {
      // 多模态消息
      const content: Array<{ type: string; text?: string; image?: string }> = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      for (const att of msg.attachments) {
        if (att.mimeType.startsWith("image/")) {
          content.push({ type: "image", image: att.url });
        }
      }
      qwenMessages.push({ role: msg.role as "user" | "assistant", content });
    } else {
      qwenMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }

  const requestBody: QwenRequest = {
    model,
    messages: qwenMessages,
    stream,
    temperature: generationConfig?.temperature,
    top_p: generationConfig?.topP,
    max_tokens: generationConfig?.maxOutputTokens,
  };

  const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API error: ${response.status} ${errorText}`);
  }

  return response;
}

// 将通义千问流式响应转换为 Gemini SSE 格式
export async function* transformQwenStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  let receivedDone = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        receivedDone = true;
        yield "data: [DONE]\n\n";
        continue;
      }

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          yield `data: ${JSON.stringify({ text: delta.content })}\n\n`;
        }
      } catch (e) {
        console.warn("[Qwen stream parse error]", e);
      }
    }
  }
  // 确保始终发送 [DONE] 结束信号
  if (!receivedDone) {
    yield "data: [DONE]\n\n";
  }
}

// DashScope 文生图 API（异步任务模式）
export async function handleQwenImageGen(
  apiKey: string,
  messages: Array<{ role: string; content: string; attachments?: Array<{ mimeType: string; url: string }> }>
): Promise<Response> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const rawPrompt = lastUserMsg?.content || "一幅美丽的风景画";

  // 增强提示词：强制中文内容 + 检测脑图/思维导图关键词自动添加插画风格
  const isMindMap = /脑图|思维导图|mind\s*map|知识图谱|概念图/i.test(rawPrompt);
  let enhancedPrompt = rawPrompt;
  if (isMindMap) {
    enhancedPrompt = `${rawPrompt}，插画风格，可爱卡通手绘风，彩色圆形气泡节点，配有小图标和emoji表情，所有文字必须使用中文，背景浅色干净，色彩丰富明亮，高清细节`;
  } else if (!/英文|english/i.test(rawPrompt)) {
    // 非明确要求英文时，默认添加中文要求
    enhancedPrompt = `${rawPrompt}，图中所有文字使用中文`;
  }

  // 检查是否有图片附件（图片编辑模式）
  const hasImageAttachment = lastUserMsg?.attachments?.some(
    (att) => att.mimeType.startsWith("image/")
  );

  // 选择模型：文生图用 wanx2.1-t2i-plus（DashScope 异步任务 API 支持的最佳模型）
  const model = "wanx2.1-t2i-plus";

  // 构建请求体
  const requestBody: Record<string, unknown> = {
    model,
    input: { prompt: enhancedPrompt },
    parameters: {
      size: "1024*1024",
      n: 1,
    },
  };

  // 如果有图片附件，加入参考图片（图生图）
  if (hasImageAttachment && lastUserMsg?.attachments) {
    const imageAtt = lastUserMsg.attachments.find((att) => att.mimeType.startsWith("image/"));
    if (imageAtt) {
      requestBody.input = {
        prompt: rawPrompt,
        base_image_url: imageAtt.url,
      };
    }
  }

  try {
    // Step 1: 提交异步任务
    const submitResp = await fetch(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!submitResp.ok) {
      const errText = await submitResp.text();
      console.error("[Qwen ImageGen] Submit failed:", submitResp.status, errText);
      return new Response(
        JSON.stringify({ error: `图片生成失败: ${submitResp.status}`, details: errText }),
        { status: submitResp.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const submitData = await submitResp.json();
    const taskId = submitData.output?.task_id;
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "图片生成任务创建失败" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Qwen ImageGen] Task submitted:", taskId);

    // Step 2: 轮询等待结果（最多 60 秒）
    const maxWaitMs = 60000;
    const pollInterval = 2500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollResp = await fetch(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      if (!pollResp.ok) continue;

      const pollData = await pollResp.json();
      const status = pollData.output?.task_status;

      if (status === "SUCCEEDED") {
        const results = pollData.output?.results || [];
        const images = results
          .filter((r: { url?: string }) => r.url)
          .map((r: { url: string }) => r.url);

        if (images.length === 0) {
          return new Response(
            JSON.stringify({ error: "未能生成图片，请尝试不同的描述" }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        console.log("[Qwen ImageGen] Success, images:", images.length);
        return new Response(
          JSON.stringify({ text: "已为您生成图片：", images }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (status === "FAILED") {
        const errMsg = pollData.output?.message || "图片生成失败";
        console.error("[Qwen ImageGen] Task failed:", errMsg);
        return new Response(
          JSON.stringify({ error: errMsg }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // PENDING / RUNNING → 继续轮询
    }

    return new Response(
      JSON.stringify({ error: "图片生成超时，请稍后重试" }),
      { status: 504, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Qwen ImageGen] Error:", err);
    return new Response(
      JSON.stringify({ error: `图片生成异常: ${err instanceof Error ? err.message : "未知错误"}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// 保留兼容（已废弃）
export function qwenImageGenNotSupported(): string {
  return "⚠️ 通义千问模式暂不支持图片生成功能。请切换到 Gemini 模式或使用文字对话。";
}
