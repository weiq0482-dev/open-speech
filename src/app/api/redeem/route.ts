import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { redeemCoupon, getUserQuota, isCouponCode, getSystemSettingsPublic } from "@/lib/quota-store";

// 频率限制：同一 IP 每小时最多 10 次兑换尝试
const RATE_LIMIT = 10;
const RATE_WINDOW = 3600; // 秒

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

async function checkRateLimit(ip: string): Promise<boolean> {
  const redis = getRedis();
  const key = `rate:redeem:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_WINDOW);
  return count <= RATE_LIMIT;
}

// POST: 兑换码激活
export async function POST(req: NextRequest) {
  try {
    // 频率限制检查
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
    }

    const { userId, code } = await req.json();

    if (!userId || !code?.trim()) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (!isCouponCode(code.trim())) {
      return NextResponse.json({ error: "兑换码格式不正确，正确格式如 OS-XXXX-XXXX" }, { status: 400 });
    }

    const result = await redeemCoupon(userId, code.trim());

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      quota: result.quota,
    });
  } catch (err) {
    console.error("[POST /api/redeem]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// GET: 查询用户配额
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    const [quota, settings] = await Promise.all([
      getUserQuota(userId),
      getSystemSettingsPublic(),
    ]);
    return NextResponse.json({ quota: { ...quota, freeDailyLimit: settings.freeDailyLimit, freeTrialDays: settings.freeTrialDays } });
  } catch (err) {
    console.error("[GET /api/redeem]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
