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

interface UserConfig {
  generationConfig?: {
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
    thinkingBudget: number;
  };
  activeMode?: string;
  customSystemInstruction?: string;
}

// GET: 读取用户配置
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ config: null });
    }
    const redis = getRedis();
    const config = await redis.get<UserConfig>(`user_config:${userId}`);
    return NextResponse.json({ config: config || null });
  } catch (err) {
    console.error("[GET /api/user-config]", err);
    return NextResponse.json({ config: null });
  }
}

// POST: 保存用户配置
export async function POST(req: NextRequest) {
  try {
    const { userId, generationConfig, activeMode, customSystemInstruction } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }
    const redis = getRedis();
    const config: UserConfig = { generationConfig, activeMode, customSystemInstruction };
    await redis.set(`user_config:${userId}`, config);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/user-config]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
