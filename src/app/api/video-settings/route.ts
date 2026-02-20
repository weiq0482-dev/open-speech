import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId } from "@/lib/notebook-utils";

const VIDEO_SETTINGS_KEY = "user_video_settings:";

// 单个数字人角色
export interface DigitalHumanProfile {
  id: string;             // 唯一ID
  name: string;           // 角色名称（如"主讲人"、"嘉宾A"）
  avatarPhotoUrl: string; // 形象照URL
  avatarStyle: "formal" | "casual" | "cartoon";
  voiceId: string;        // CosyVoice预置声音ID
  cloneVoiceUrl: string;  // 声音克隆URL（用户上传后生成）
  voiceSampleUploaded: boolean;
}

// 平台账号绑定
export interface PlatformAccount {
  platform: string;       // douyin | bilibili | xiaohongshu | weixin | kuaishou | youtube
  accountName: string;    // 账号名称/昵称
  accountId: string;      // 平台账号ID或链接
  accessToken?: string;   // OAuth token（部分平台支持）
  connected: boolean;
}

export interface VideoUserSettings {
  // 多数字人（2-3个角色）
  digitalHumans: DigitalHumanProfile[];
  // 默认配音（无数字人时使用）
  defaultVoiceId: string;
  voiceSpeed: number;
  // 视频品牌
  watermarkText: string;
  openingTemplate: string;
  closingTemplate: string;
  // 默认配置
  defaultRatio: "16:9" | "9:16" | "1:1";
  defaultTheme: string;
  defaultStyle: string;
  // 平台账号
  platformAccounts: PlatformAccount[];
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
      digitalHumans: [
        { id: "host", name: "主讲人", avatarPhotoUrl: "", avatarStyle: "formal", voiceId: "longxiaochun", cloneVoiceUrl: "", voiceSampleUploaded: false },
      ],
      defaultVoiceId: "longxiaochun",
      voiceSpeed: 1.0,
      watermarkText: "",
      openingTemplate: "",
      closingTemplate: "",
      defaultRatio: "9:16",
      defaultTheme: "dark",
      defaultStyle: "knowledge",
      platformAccounts: [],
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
