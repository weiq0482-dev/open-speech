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

    // Backfill + 访问日志（异步，不阻塞响应）
    const redis = getRedis();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    Promise.all([
      // 确保邮箱在 all_accounts 索引中
      redis.get<string[]>("all_accounts").then(allEmails => {
        const list = allEmails || [];
        if (!list.includes(payload.email.toLowerCase().trim())) {
          return redis.set("all_accounts", [...list, payload.email.toLowerCase().trim()]);
        }
      }),
      // 写访问日志（只保留最近1000条）
      redis.lpush("monitor:logs", { userId: account.userId, action: "login", ip, time: new Date().toISOString() })
        .then(() => redis.ltrim("monitor:logs", 0, 999)),
    ]).catch(() => {});

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
