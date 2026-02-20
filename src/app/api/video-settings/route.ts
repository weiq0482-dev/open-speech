import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId } from "@/lib/notebook-utils";

const VIDEO_SETTINGS_KEY = "user_video_settings:";

export interface VideoUserSettings {
  // 配音设置
  voiceId: string;
  voiceSpeed: number;
  // 声音克隆
  cloneVoiceUrl: string;
  voiceSampleUploaded: boolean;
  // 数字人设置
  avatarPhotoUrl: string;
  avatarStyle: "formal" | "casual" | "cartoon";
  // 视频品牌
  watermarkText: string;
  openingTemplate: string;
  closingTemplate: string;
  // 默认配置
  defaultRatio: "16:9" | "9:16" | "1:1";
  defaultTheme: string;
  defaultStyle: string;
}

// GET: 获取用户视频设置
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId || !isValidUserId(userId)) {
    return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
  }

  const redis = getRedis();
  const settings = await redis.get<VideoUserSettings>(`${VIDEO_SETTINGS_KEY}${userId}`);

  return NextResponse.json({
    settings: settings || {
      voiceId: "longxiaochun",
      voiceSpeed: 1.0,
      cloneVoiceUrl: "",
      voiceSampleUploaded: false,
      avatarPhotoUrl: "",
      avatarStyle: "formal",
      watermarkText: "",
      openingTemplate: "",
      closingTemplate: "",
      defaultRatio: "9:16",
      defaultTheme: "dark",
      defaultStyle: "knowledge",
    },
  });
}

// POST: 保存用户视频设置
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, ...settings } = body;

    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const existing = await redis.get<VideoUserSettings>(`${VIDEO_SETTINGS_KEY}${userId}`) || {};
    const merged = { ...existing, ...settings };

    await redis.set(`${VIDEO_SETTINGS_KEY}${userId}`, merged);

    return NextResponse.json({ success: true, settings: merged });
  } catch (err) {
    console.error("[POST /api/video-settings]", err);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
