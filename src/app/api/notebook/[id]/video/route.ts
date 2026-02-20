import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId, NB_PREFIX } from "@/lib/notebook-utils";
import { generateVideoScript, checkCompliance, type VideoScript, type VideoStyle } from "@/lib/video-script-generator";
import { canUse, deductQuota } from "@/lib/quota-store";

const NB_VIDEO = "nb_video:";

// POST: 生成视频脚本 / 合规检查
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, action, style, targetDuration } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    // ========== 生成视频脚本 ==========
    if (action === "generate_script") {
      const check = await canUse(userId, "chat");
      if (!check.allowed) {
        return NextResponse.json({ error: check.reason || "额度不足", quotaExhausted: true }, { status: 429 });
      }

      const script = await generateVideoScript({
        notebookId,
        style: (style as VideoStyle) || "knowledge",
        targetDuration: targetDuration || 180,
      });

      // 保存脚本
      await redis.set(`${NB_VIDEO}${notebookId}:script`, script);
      deductQuota(userId, "chat").catch((err) => console.error("[Video deductQuota]", err));

      return NextResponse.json({ success: true, script });
    }

    // ========== 合规检查 ==========
    if (action === "compliance_check") {
      const scriptData = await redis.get<VideoScript>(`${NB_VIDEO}${notebookId}:script`);
      if (!scriptData) {
        return NextResponse.json({ error: "请先生成视频脚本" }, { status: 400 });
      }

      const result = await checkCompliance(scriptData);
      await redis.set(`${NB_VIDEO}${notebookId}:compliance`, result);

      return NextResponse.json({ success: true, compliance: result });
    }

    // ========== 生成配音（CosyVoice） ==========
    if (action === "generate_audio") {
      const scriptData = await redis.get<VideoScript>(`${NB_VIDEO}${notebookId}:script`);
      if (!scriptData) {
        return NextResponse.json({ error: "请先生成视频脚本" }, { status: 400 });
      }

      const check = await canUse(userId, "chat");
      if (!check.allowed) {
        return NextResponse.json({ error: check.reason || "额度不足", quotaExhausted: true }, { status: 429 });
      }

      const { synthesizeSpeech, isCosyVoiceAvailable } = await import("@/lib/cosyvoice-tts");

      if (!isCosyVoiceAvailable()) {
        return NextResponse.json({ error: "CosyVoice 未配置，请设置 DASHSCOPE_API_KEY" }, { status: 500 });
      }

      // 合并所有配音文字
      const allSegments = [
        { text: scriptData.openingNarration, label: "opening" },
        ...scriptData.scenes.map((s, i) => ({ text: s.narration, label: `scene_${i}` })),
        { text: scriptData.closingNarration, label: "closing" },
      ].filter((s) => s.text.trim());

      // 读取用户声音设置
      const userSettings = await redis.get<{ voiceId?: string; cloneVoiceUrl?: string }>(`user_video_settings:${userId}`);
      const voiceOpts = {
        voice: userSettings?.voiceId || "longxiaochun",
        cloneVoiceUrl: userSettings?.cloneVoiceUrl,
      };

      // 逐段合成
      const audioResults: Array<{ label: string; audioUrl: string; duration: number }> = [];
      for (const seg of allSegments) {
        try {
          const result = await synthesizeSpeech({
            text: seg.text,
            ...voiceOpts,
          });
          audioResults.push({ label: seg.label, ...result });
        } catch (err) {
          console.error(`[Video TTS] ${seg.label} failed:`, err);
          audioResults.push({ label: seg.label, audioUrl: "", duration: 0 });
        }
      }

      await redis.set(`${NB_VIDEO}${notebookId}:audio`, audioResults);
      deductQuota(userId, "chat").catch((err) => console.error("[Video audio deductQuota]", err));

      return NextResponse.json({ success: true, audio: audioResults });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/video]", err);
    return NextResponse.json({ error: `服务器错误: ${err instanceof Error ? err.message : "未知"}` }, { status: 500 });
  }
}

// GET: 获取视频数据（脚本/音频/合规结果）
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    const [script, compliance, audio, userSettings] = await Promise.all([
      redis.get(`${NB_VIDEO}${notebookId}:script`),
      redis.get(`${NB_VIDEO}${notebookId}:compliance`),
      redis.get(`${NB_VIDEO}${notebookId}:audio`),
      redis.get(`user_video_settings:${userId}`),
    ]);

    return NextResponse.json({
      script: script || null,
      compliance: compliance || null,
      audio: audio || null,
      userSettings: userSettings || null,
    });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/video]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
