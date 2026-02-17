import { Redis } from "@upstash/redis";

// ========== 类型定义 ==========
export interface CouponData {
  plan: "trial" | "monthly" | "quarterly";
  chatQuota: number;
  imageQuota: number;
  durationDays: number;
  createdAt: string;
  usedBy?: string;
  usedAt?: string;
}

export interface UserQuota {
  plan: "free" | "trial" | "monthly" | "quarterly";
  chatRemaining: number;
  imageRemaining: number;
  expiresAt: string | null;
  redeemCode: string | null;
  // 免费用户每日额度
  dailyFreeUsed: number;
  dailyFreeDate: string;
  // 免费试用期开始时间（首次使用时记录）
  freeTrialStarted?: string;
}

// ========== 套餐配置 ==========
export const PLAN_CONFIG = {
  trial:     { chatQuota: 50,   imageQuota: 10,  durationDays: 7,  label: "体验卡（7天）" },
  monthly:   { chatQuota: 500,  imageQuota: 50,  durationDays: 30, label: "月卡（30天）" },
  quarterly: { chatQuota: 2000, imageQuota: 200, durationDays: 90, label: "季卡（90天）" },
};

export const FREE_DAILY_LIMIT = 5;
export const FREE_TRIAL_DAYS = 30;

// ========== Redis Key ==========
const COUPON_PREFIX = "coupon:";
const QUOTA_PREFIX = "quota:";

// ========== Redis 客户端 ==========
let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return redisClient;
}

// ========== 获取用户配额 ==========
export async function getUserQuota(userId: string): Promise<UserQuota> {
  const redis = getRedis();
  const existing = await redis.get<UserQuota>(`${QUOTA_PREFIX}${userId}`);

  if (existing) {
    // 检查是否过期
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      // 套餐过期，降级为免费
      const freeQuota: UserQuota = {
        plan: "free",
        chatRemaining: 0,
        imageRemaining: 0,
        expiresAt: null,
        redeemCode: null,
        dailyFreeUsed: existing.dailyFreeUsed,
        dailyFreeDate: existing.dailyFreeDate,
      };
      await redis.set(`${QUOTA_PREFIX}${userId}`, freeQuota);
      return freeQuota;
    }
    return existing;
  }

  // 新用户，返回免费配额，记录免费试用期开始时间
  const today = new Date().toISOString().slice(0, 10);
  const newQuota: UserQuota = {
    plan: "free",
    chatRemaining: 0,
    imageRemaining: 0,
    expiresAt: null,
    redeemCode: null,
    dailyFreeUsed: 0,
    dailyFreeDate: today,
    freeTrialStarted: new Date().toISOString(),
  };
  await redis.set(`${QUOTA_PREFIX}${userId}`, newQuota);
  return newQuota;
}

// ========== 检查是否可以使用（不扣费） ==========
export async function canUse(userId: string, type: "chat" | "image"): Promise<{ allowed: boolean; reason?: string; quota: UserQuota }> {
  const quota = await getUserQuota(userId);
  const today = new Date().toISOString().slice(0, 10);

  // 付费用户检查
  if (quota.plan !== "free") {
    if (type === "chat" && quota.chatRemaining > 0) return { allowed: true, quota };
    if (type === "image" && quota.imageRemaining > 0) return { allowed: true, quota };
    return { allowed: false, reason: "套餐额度已用完，请续费", quota };
  }

  // 检查免费试用期是否过期
  if (quota.freeTrialStarted) {
    const trialStart = new Date(quota.freeTrialStarted);
    const now = new Date();
    const daysSinceStart = (now.getTime() - trialStart.getTime()) / (1000 * 86400);
    if (daysSinceStart > FREE_TRIAL_DAYS) {
      return { allowed: false, reason: `免费试用期已结束（${FREE_TRIAL_DAYS}天），请兑换体验卡或购买套餐`, quota };
    }
  } else {
    // 老用户没有 freeTrialStarted 字段，补记录
    quota.freeTrialStarted = new Date().toISOString();
  }

  // 免费用户检查每日额度
  if (quota.dailyFreeDate !== today) {
    // 新的一天，重置
    quota.dailyFreeUsed = 0;
    quota.dailyFreeDate = today;
  }

  if (quota.dailyFreeUsed < FREE_DAILY_LIMIT) {
    return { allowed: true, quota };
  }

  return { allowed: false, reason: "今日免费额度已用完", quota };
}

// ========== 扣减额度 ==========
export async function deductQuota(userId: string, type: "chat" | "image"): Promise<void> {
  const redis = getRedis();
  const quota = await getUserQuota(userId);
  const today = new Date().toISOString().slice(0, 10);

  if (quota.plan !== "free") {
    if (type === "chat") quota.chatRemaining = Math.max(0, quota.chatRemaining - 1);
    if (type === "image") quota.imageRemaining = Math.max(0, quota.imageRemaining - 1);
  } else {
    // 免费用户扣每日额度
    if (quota.dailyFreeDate !== today) {
      quota.dailyFreeUsed = 0;
      quota.dailyFreeDate = today;
    }
    quota.dailyFreeUsed += 1;
  }

  await redis.set(`${QUOTA_PREFIX}${userId}`, quota);
}

// ========== 兑换码验证 ==========
export async function redeemCoupon(userId: string, code: string): Promise<{ success: boolean; message: string; quota?: UserQuota }> {
  const redis = getRedis();
  const couponKey = `${COUPON_PREFIX}${code.toUpperCase()}`;
  const coupon = await redis.get<CouponData>(couponKey);

  if (!coupon) {
    return { success: false, message: "兑换码无效" };
  }

  if (coupon.usedBy) {
    return { success: false, message: "该兑换码已被使用" };
  }

  // 标记兑换码为已使用
  coupon.usedBy = userId;
  coupon.usedAt = new Date().toISOString();
  await redis.set(couponKey, coupon);

  // 计算过期时间
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + coupon.durationDays);

  // 获取当前配额，叠加（如果有剩余）
  const existing = await getUserQuota(userId);
  const newQuota: UserQuota = {
    plan: coupon.plan,
    chatRemaining: (existing.plan !== "free" ? existing.chatRemaining : 0) + coupon.chatQuota,
    imageRemaining: (existing.plan !== "free" ? existing.imageRemaining : 0) + coupon.imageQuota,
    expiresAt: expiresAt.toISOString(),
    redeemCode: code.toUpperCase(),
    dailyFreeUsed: existing.dailyFreeUsed,
    dailyFreeDate: existing.dailyFreeDate,
  };

  await redis.set(`${QUOTA_PREFIX}${userId}`, newQuota);

  const planLabel = PLAN_CONFIG[coupon.plan]?.label || coupon.plan;
  return {
    success: true,
    message: `${planLabel} 激活成功！对话 ${newQuota.chatRemaining} 次 + 生图 ${newQuota.imageRemaining} 次`,
    quota: newQuota,
  };
}

// ========== 生成兑换码 ==========
export async function generateCoupons(
  plan: "trial" | "monthly" | "quarterly",
  count: number
): Promise<string[]> {
  const redis = getRedis();
  const config = PLAN_CONFIG[plan];
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const code = `OS-${part1}-${part2}`;

    const coupon: CouponData = {
      plan,
      chatQuota: config.chatQuota,
      imageQuota: config.imageQuota,
      durationDays: config.durationDays,
      createdAt: new Date().toISOString(),
    };

    await redis.set(`${COUPON_PREFIX}${code}`, coupon);
    codes.push(code);
  }

  return codes;
}

// ========== IP 级别每日额度（防绕过） ==========
const IP_DAILY_PREFIX = "ip_daily:";

export async function canUseByIp(ip: string): Promise<boolean> {
  const redis = getRedis();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${IP_DAILY_PREFIX}${ip}:${today}`;
  const used = await redis.get<number>(key);
  return (used || 0) < FREE_DAILY_LIMIT;
}

export async function deductByIp(ip: string): Promise<void> {
  const redis = getRedis();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${IP_DAILY_PREFIX}${ip}:${today}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86400);
}

// ========== 兑换码格式检测 ==========
export function isCouponCode(input: string): boolean {
  return /^OS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(input.trim());
}
