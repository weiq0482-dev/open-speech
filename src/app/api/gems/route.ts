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

interface GemData {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

// GET: 读取用户自定义 Gems
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ gems: [] });
    }
    const redis = getRedis();
    const gems = await redis.get<GemData[]>(`gems:${userId}`) || [];
    return NextResponse.json({ gems });
  } catch (err) {
    console.error("[GET /api/gems]", err);
    return NextResponse.json({ gems: [] });
  }
}

// POST: 保存用户自定义 Gems（全量覆盖）
export async function POST(req: NextRequest) {
  try {
    const { userId, gems } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }
    const redis = getRedis();
    const toSave: GemData[] = (gems || []).filter((g: GemData) => g.id && g.name);
    await redis.set(`gems:${userId}`, toSave);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/gems]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
