import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// ========== Redis 客户端 ==========
let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return redisClient;
}

// ========== Admin 鉴权 ==========
export function verifyAdminKey(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;

  // 从 header 或 query 中获取 key
  const headerKey = req.headers.get("x-admin-key");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key");

  return headerKey === adminKey || queryKey === adminKey;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "未授权访问" }, { status: 401 });
}

// ========== 常量 ==========
export const THREAD_PREFIX = "thread:";
export const ALL_THREADS_KEY = "all_threads";
export const QUOTA_PREFIX = "quota:";
export const COUPON_PREFIX = "coupon:";
export const ALL_COUPONS_KEY = "all_coupons";
export const SETTINGS_KEY = "system_settings";
export const SITE_CONFIG_KEY = "site_config";
export const ACCOUNT_PREFIX = "account:";

// ========== 兼容读取会话列表 ==========
export async function getThreadUserIds(): Promise<string[]> {
  const redis = getRedis();
  try {
    return (await redis.smembers(ALL_THREADS_KEY)) || [];
  } catch {
    try {
      const old = await redis.get<string[]>(ALL_THREADS_KEY);
      if (Array.isArray(old) && old.length > 0) {
        await redis.del(ALL_THREADS_KEY);
        for (const uid of old) await redis.sadd(ALL_THREADS_KEY, uid);
        return old;
      }
    } catch { /* ignore */ }
    return [];
  }
}
