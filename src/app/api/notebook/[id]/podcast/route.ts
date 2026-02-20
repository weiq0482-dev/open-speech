import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId, NB_PREFIX, NB_PODCAST, collectSourceTexts, callAI } from "@/lib/notebook-utils";

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

    // 调用 AI 生成脚本（自动适配 Gemini / 千问）
    let script: string;
    try {
      script = await callAI({
        systemPrompt: prompt + "\n\n**重要：无论资料是什么语言，脚本必须全部使用中文。** 如果资料是英文或其他语言，请翻译成中文后编写。",
        contents: [{
          role: "user",
          parts: [{ text: `以下是知识库的资料，请用中文生成播客脚本：\n\n${sourceTexts.slice(0, 50000)}` }],
        }],
        temperature: 0.9,
        maxOutputTokens: 8192,
      });
    } catch (err) {
      console.error("[Podcast AI]", err);
      return NextResponse.json({ error: "AI 生成失败" }, { status: 500 });
    }

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

    // 保存播客数据（按模式分开存储，避免互相覆盖）
    const podcast = {
      mode: podcastMode,
      script,
      segments,
      voices: VOICES,
      generatedAt: new Date().toISOString(),
    };
    await redis.set(`${NB_PODCAST}${notebookId}:${podcastMode}`, podcast);
    // 同时更新默认 key（向后兼容）
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
    // 返回两种模式的数据
    const [narration, dialogue] = await Promise.all([
      redis.get(`${NB_PODCAST}${params.id}:narration`),
      redis.get(`${NB_PODCAST}${params.id}:dialogue`),
    ]);
    const podcast = await redis.get(`${NB_PODCAST}${params.id}`);
    return NextResponse.json({
      podcast: podcast || null,
      podcastNarration: narration || null,
      podcastDialogue: dialogue || null,
      voices: VOICES,
    });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/podcast]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
