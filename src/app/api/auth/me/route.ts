import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAccountByEmail } from "@/lib/auth-store";
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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    }

    const account = await getAccountByEmail(payload.email);
    if (!account) {
      return NextResponse.json({ error: "账户不存在" }, { status: 404 });
    }

    // Backfill: 确保邮箱在 all_accounts 索引中（兼容旧用户）
    try {
      const redis = getRedis();
      const allEmails = (await redis.get<string[]>("all_accounts")) || [];
      if (!allEmails.includes(payload.email.toLowerCase().trim())) {
        await redis.set("all_accounts", [...allEmails, payload.email.toLowerCase().trim()]);
      }
    } catch { /* backfill 失败不阻断正常流程 */ }

    return NextResponse.json({
      userId: account.userId,
      email: account.email,
      createdAt: account.createdAt,
      lastLogin: account.lastLogin,
    });
  } catch (err) {
    console.error("[GET /api/auth/me]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
