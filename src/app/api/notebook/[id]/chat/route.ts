import { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return _redis;
}

function isValidUserId(id: string): boolean {
  return /^u_[a-f0-9]{12}_[a-z0-9]+$/.test(id) || /^em_[a-f0-9]{16}$/.test(id);
}

const NB_PREFIX = "nb:";
const NB_SRC_PREFIX = "nb_src:";
const NB_SRC_INDEX = "nb_src_index:";
const NB_CHAT = "nb_chat:";

interface ChatMessage {
  role: "user" | "model";
  content: string;
  timestamp: string;
}

// 收集笔记本的所有启用来源文本
async function collectSourceTexts(redis: Redis, notebookId: string): Promise<string> {
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

// POST: 笔记本 AI 对话（流式）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, message, history } = await req.json();
    if (!userId || !isValidUserId(userId) || !message) {
      return new Response(JSON.stringify({ error: "参数错误" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 验证笔记本存在
    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
    if (!nb) {
      return new Response(JSON.stringify({ error: "知识库不存在" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 收集来源文本
    const sourceTexts = await collectSourceTexts(redis, notebookId);

    // 构建系统提示词
    const systemPrompt = sourceTexts
      ? `你是一个知识库分析助手。用户提供了以下参考资料，请基于这些资料回答用户的问题。
如果问题与资料相关，请引用具体来源回答。如果资料中没有相关信息，请说明并尽你所能回答。
回复使用 Markdown 格式。

===== 知识库资料 =====
${sourceTexts}
===== 资料结束 =====`
      : "你是一个知识库分析助手。当前知识库没有来源资料，请提醒用户先添加资料来源。回复使用 Markdown 格式。";

    // 构建对话历史
    const chatHistory = (history || []).slice(-10).map((m: ChatMessage) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // 调用 AI（流式）
    const apiBase = process.env.AI_API_BASE || process.env.GEMINI_API_BASE || "https://4sapi.com";
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
    const model = "gemini-2.5-pro-preview-06-05";

    const aiResp = await fetch(
      `${apiBase}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            ...chatHistory,
            { role: "user", parts: [{ text: message }] },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!aiResp.ok || !aiResp.body) {
      console.error("[Notebook Chat AI]", aiResp.status);
      return new Response(JSON.stringify({ error: "AI 服务暂时不可用" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 转发流式响应
    const reader = aiResp.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  fullResponse += text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              } catch {}
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // 异步保存对话历史到 Redis
          const chatKey = `${NB_CHAT}${notebookId}`;
          const existingChat: ChatMessage[] = (await redis.get(chatKey) as ChatMessage[]) || [];
          existingChat.push(
            { role: "user", content: message, timestamp: new Date().toISOString() },
            { role: "model", content: fullResponse, timestamp: new Date().toISOString() }
          );
          // 只保留最近 50 轮对话
          const trimmed = existingChat.slice(-100);
          await redis.set(chatKey, trimmed);
        } catch (err) {
          console.error("[Notebook Chat Stream]", err);
          controller.error(err);
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
  } catch (err) {
    console.error("[POST /api/notebook/[id]/chat]", err);
    return new Response(JSON.stringify({ error: "服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// GET: 获取对话历史
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return new Response(JSON.stringify({ error: "无效的用户标识" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const redis = getRedis();
    const chatKey = `${NB_CHAT}${params.id}`;
    const messages: ChatMessage[] = (await redis.get(chatKey) as ChatMessage[]) || [];

    return new Response(JSON.stringify({ messages }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/chat]", err);
    return new Response(JSON.stringify({ error: "服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
