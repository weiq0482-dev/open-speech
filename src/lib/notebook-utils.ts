import { Redis } from "@upstash/redis";

// ========== Redis 单例 ==========
let _redis: Redis | null = null;
export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return _redis;
}

// ========== 用户验证 ==========
export function isValidUserId(id: string): boolean {
  return /^u_[a-f0-9]{12}_[a-z0-9]+$/.test(id) || /^em_[a-f0-9]{16}$/.test(id);
}

// ========== Redis Key 前缀 ==========
export const NB_PREFIX = "nb:";
export const NB_INDEX = "nb_index:";
export const NB_SRC_PREFIX = "nb_src:";
export const NB_SRC_INDEX = "nb_src_index:";
export const NB_CHAT = "nb_chat:";
export const NB_STUDIO = "nb_studio:";
export const NB_DISCUSS = "nb_discuss:";
export const NB_MEMBERS_PREFIX = "nb_members:";
export const NB_SHARE_PREFIX = "nb_share:";
export const NB_SHARE_MAP = "nb_share_map:";
export const NB_PODCAST = "nb_podcast:";

export const MAX_NOTEBOOKS_PER_USER = 50;
export const MAX_SOURCES = 50;

// ========== 收集来源文本（chat / studio / podcast 共用）==========
export async function collectSourceTexts(redis: Redis, notebookId: string): Promise<string> {
  const srcIds: string[] = (await redis.lrange(`${NB_SRC_INDEX}${notebookId}`, 0, -1)) || [];
  if (srcIds.length === 0) return "";

  const pipeline = redis.pipeline();
  for (const id of srcIds) {
    pipeline.get(`${NB_SRC_PREFIX}${notebookId}:${id}`);
  }
  const results = await pipeline.exec();

  const texts: string[] = [];
  let totalLen = 0;
  const MAX_TOTAL = 200000;

  for (const src of results) {
    if (!src || typeof src !== "object") continue;
    const s = src as { enabled?: boolean; title?: string; content?: string };
    if (!s.enabled) continue;
    const chunk = `【来源: ${s.title || "未命名"}】\n${s.content || ""}`;
    if (totalLen + chunk.length > MAX_TOTAL) break;
    texts.push(chunk);
    totalLen += chunk.length;
  }

  return texts.join("\n\n---\n\n");
}

// ========== AI 模型调用（自动适配 Gemini / 千问）==========
interface AICallOptions {
  systemPrompt: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
}

export async function getModelConfig(): Promise<{
  provider: "gemini" | "qwen";
  apiBase: string;
  apiKey: string;
  qwenApiKey: string;
}> {
  const redis = getRedis();
  const settings = await redis.get<{ modelProvider?: string; qwenApiKey?: string }>("system:settings") || {};
  const provider = (settings.modelProvider === "qwen" ? "qwen" : "gemini") as "gemini" | "qwen";
  return {
    provider,
    apiBase: process.env.AI_API_BASE || process.env.GEMINI_API_BASE || "https://4sapi.com",
    apiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "",
    qwenApiKey: settings.qwenApiKey || "",
  };
}

// 非流式 AI 调用（studio / podcast）
export async function callAI(opts: AICallOptions): Promise<string> {
  const config = await getModelConfig();

  if (config.provider === "qwen") {
    return callQwenNonStream(config.qwenApiKey, opts);
  }

  // Gemini 模式
  const model = "gemini-2.5-pro-preview-06-05";
  const resp = await fetch(
    `${config.apiBase}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.systemPrompt }] },
        contents: opts.contents,
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
        },
      }),
    }
  );

  if (!resp.ok) {
    throw new Error(`AI API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// 流式 AI 调用（chat）
export async function callAIStream(opts: AICallOptions): Promise<Response> {
  const config = await getModelConfig();

  if (config.provider === "qwen") {
    return callQwenStream(config.qwenApiKey, opts);
  }

  // Gemini 流式
  const model = "gemini-2.5-pro-preview-06-05";
  return fetch(
    `${config.apiBase}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.systemPrompt }] },
        contents: opts.contents,
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
        },
      }),
    }
  );
}

// ========== 千问适配（内部）==========
async function callQwenNonStream(apiKey: string, opts: AICallOptions): Promise<string> {
  const messages = [];
  if (opts.systemPrompt) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  for (const c of opts.contents) {
    messages.push({
      role: c.role === "model" ? "assistant" : "user",
      content: c.parts.map((p) => p.text).join(""),
    });
  }

  const resp = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages,
      stream: false,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxOutputTokens ?? 8192,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Qwen API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callQwenStream(apiKey: string, opts: AICallOptions): Promise<Response> {
  const messages = [];
  if (opts.systemPrompt) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  for (const c of opts.contents) {
    messages.push({
      role: c.role === "model" ? "assistant" : "user",
      content: c.parts.map((p) => p.text).join(""),
    });
  }

  return fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxOutputTokens ?? 8192,
    }),
  });
}

// ========== SSRF 防护 ==========
export function isUrlSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    // 仅允许 http/https
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    // 禁止内网地址
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("172.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^fd[0-9a-f]{2}:/i.test(host) || // IPv6 ULA
      host === "::1" ||
      host === "[::1]" ||
      host.includes("metadata.google") ||
      host.includes("metadata.aws")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
