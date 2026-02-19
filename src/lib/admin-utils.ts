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
// 支持两种鉴权方式：
// 1. 超级管理员密钥：x-admin-key = ADMIN_KEY
// 2. 普通管理员：x-admin-key = "user:username:password"（运行时查 Redis 验证）
export function verifyAdminKey(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;

  const headerKey = req.headers.get("x-admin-key");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key");
  const key = headerKey || queryKey || "";

  // 方式1：超级管理员密钥
  if (key === adminKey) return true;

  // 方式2：普通管理员格式 "user:username:password"，异步验证在中间件处理
  // 此处简单放行（实际验证由各 API 按需处理）
  if (key.startsWith("user:")) return true;

  return false;
}

// 获取当前请求的管理员信息
export function getAdminInfo(req: NextRequest): { username: string; role: "super" | "normal" } {
  const adminKey = process.env.ADMIN_KEY;
  const headerKey = req.headers.get("x-admin-key") || "";

  if (headerKey === adminKey) {
    return { username: "super_admin", role: "super" };
  }
  if (headerKey.startsWith("user:")) {
    const parts = headerKey.split(":");
    return { username: parts[1] || "unknown", role: "normal" };
  }
  return { username: "unknown", role: "normal" };
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
