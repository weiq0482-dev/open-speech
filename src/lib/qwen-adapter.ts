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
  text: "qwen-plus", // 对应 Gemini thinking-high
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
        yield "data: [DONE]\n\n";
        continue;
      }

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          // 转换为 Gemini SSE 格式
          yield `data: ${JSON.stringify({ text: delta.content })}\n\n`;
        }
        // 通义千问不支持 thinking 流，直接输出文本
      } catch (e) {
        console.warn("[Qwen stream parse error]", e);
      }
    }
  }
}

// 通义千问不支持原生图片生成，返回提示
export function qwenImageGenNotSupported(): string {
  return "⚠️ 通义千问模式暂不支持图片生成功能。请切换到 Gemini 模式或使用文字对话。";
}
