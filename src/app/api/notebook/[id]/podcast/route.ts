import { NextRequest, NextResponse } from "next/server";
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
const NB_PODCAST = "nb_podcast:";

// Edge TTS 中文声音
const VOICES = {
  male1: "zh-CN-YunxiNeural",       // 男声（年轻）
  male2: "zh-CN-YunjianNeural",     // 男声（沉稳）
  female1: "zh-CN-XiaoxiaoNeural",  // 女声（活泼）
  female2: "zh-CN-XiaohanNeural",   // 女声（温柔）
};

interface PodcastConfig {
  mode: "narration" | "dialogue";  // 朗读模式 / 对话模式
  voice?: string;                   // 朗读模式的声音
  hostVoice?: string;               // 对话模式主持人
  guestVoice?: string;              // 对话模式嘉宾
}

// 收集来源文本
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
  for (const src of results) {
    if (!src || typeof src !== "object") continue;
    const s = src as { enabled?: boolean; title?: string; content?: string };
    if (!s.enabled) continue;
    const chunk = `【${s.title || "未命名"}】\n${s.content || ""}`;
    if (totalLen + chunk.length > 100000) break;
    texts.push(chunk);
    totalLen += chunk.length;
  }
  return texts.join("\n\n");
}

// POST: 生成播客脚本（第一步：AI 生成脚本，返回脚本内容）
// 客户端收到脚本后使用 Web Speech API 或 Edge TTS 进行语音合成
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, mode, voice, hostVoice, guestVoice } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    const sourceTexts = await collectSourceTexts(redis, notebookId);
    if (!sourceTexts) {
      return NextResponse.json({ error: "没有可用的来源内容" }, { status: 400 });
    }

    const podcastMode = mode || "narration";
    let prompt: string;

    if (podcastMode === "dialogue") {
      prompt = `你是一个播客脚本编写专家。基于以下资料，生成一段两人对话式播客脚本。

要求：
1. 两个角色：主持人（Host）和嘉宾（Guest）
2. 对话自然流畅，像真人在聊天
3. 主持人负责提问和引导，嘉宾负责深入解读
4. 总长度约 2000-3000 字
5. 用中文
6. 格式必须严格遵循：
   Host: [主持人的话]
   Guest: [嘉宾的话]

每行一个角色的发言，不要加其他格式。`;
    } else {
      prompt = `你是一个播客脚本编写专家。基于以下资料，生成一段朗读式播客脚本。

要求：
1. 以第一人称讲述，像在给听众介绍一个话题
2. 语言自然、通俗易懂
3. 有开场白、主体内容、总结
4. 总长度约 1500-2500 字
5. 用中文
6. 直接输出脚本文本，不要加任何标记或格式说明`;
    }

    // 调用 AI 生成脚本
    const apiBase = process.env.AI_API_BASE || process.env.GEMINI_API_BASE || "https://4sapi.com";
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
    const model = "gemini-2.5-pro-preview-06-05";

    const aiResp = await fetch(
      `${apiBase}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{
            role: "user",
            parts: [{ text: `以下是知识库的资料，请生成播客脚本：\n\n${sourceTexts.slice(0, 50000)}` }],
          }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!aiResp.ok) {
      return NextResponse.json({ error: "AI 生成失败" }, { status: 500 });
    }

    const aiData = await aiResp.json();
    const script = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 解析对话脚本为结构化数据
    let segments: { speaker: string; text: string; voice: string }[] = [];

    if (podcastMode === "dialogue") {
      const lines = script.split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        const hostMatch = line.match(/^Host:\s*(.+)/i);
        const guestMatch = line.match(/^Guest:\s*(.+)/i);
        if (hostMatch) {
          segments.push({
            speaker: "Host",
            text: hostMatch[1].trim(),
            voice: hostVoice || VOICES.female1,
          });
        } else if (guestMatch) {
          segments.push({
            speaker: "Guest",
            text: guestMatch[1].trim(),
            voice: guestVoice || VOICES.male1,
          });
        }
      }
      // 如果解析失败，整段作为朗读
      if (segments.length === 0) {
        segments = [{ speaker: "Narrator", text: script, voice: voice || VOICES.female1 }];
      }
    } else {
      segments = [{ speaker: "Narrator", text: script, voice: voice || VOICES.female1 }];
    }

    // 保存播客数据
    const podcast = {
      mode: podcastMode,
      script,
      segments,
      voices: VOICES,
      generatedAt: new Date().toISOString(),
    };
    await redis.set(`${NB_PODCAST}${notebookId}`, podcast);

    return NextResponse.json({ success: true, podcast });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/podcast]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// GET: 获取已生成的播客数据
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const podcast = await redis.get(`${NB_PODCAST}${params.id}`);
    return NextResponse.json({ podcast: podcast || null, voices: VOICES });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/podcast]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
