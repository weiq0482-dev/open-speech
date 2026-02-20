import { Redis } from "@upstash/redis";

// ========== 类型定义 ==========
export interface CouponData {
  plan: string;
  chatQuota: number;
  imageQuota: number;
  durationDays: number;
  createdAt: string;
  expiresAt?: string;   // 兑换码本身的有效期（未使用过期作废）
  batchId?: string;     // 生成批次标识
  createdBy?: string;   // 创建者（管理员用户名）
  usedBy?: string;
  usedAt?: string;
}

export interface UserQuota {
  plan: string; // "free" | 动态卡种 ID
  chatRemaining: number;
  imageRemaining: number;
  expiresAt: string | null;
  redeemCode: string | null;
  // 免费用户每日额度
  dailyFreeUsed: number;
  dailyFreeDate: string;
  // 免费试用期开始时间（首次使用时记录）
  freeTrialStarted?: string;
  // 付费套餐每日消耗计数
  rewardDailyUsed?: number;
  rewardDailyDate?: string;
}

// ========== 动态卡种配置 ==========
export interface PlanConfig {
  id: string;           // 卡种ID，如 "trial", "monthly", "yearly3"
  label: string;        // 显示名，如 "体验卡（7天）"
  chatQuota: number;    // 对话次数
  imageQuota: number;   // 生图次数
  durationDays: number; // 有效天数
  dailyLimit: number;   // 每日使用上限
  rank: number;         // 套餐优先级（高的不会被低的覆盖）
  color?: string;       // 徽章颜色
}

const PLANS_KEY = "system_plans";

// 默认卡种（兼容旧数据）
const DEFAULT_PLANS: PlanConfig[] = [
  { id: "trial",     label: "体验卡（7天）",  chatQuota: 50,   imageQuota: 10,  durationDays: 7,   dailyLimit: 10, rank: 1, color: "blue" },
  { id: "monthly",   label: "月卡（30天）",  chatQuota: 500,  imageQuota: 50,  durationDays: 30,  dailyLimit: 30, rank: 2, color: "amber" },
  { id: "quarterly", label: "季卡（90天）",  chatQuota: 2000, imageQuota: 200, durationDays: 90,  dailyLimit: 50, rank: 3, color: "purple" },
];

// 兼容旧代码的静态配置（只做导出兼容，实际逻辑用 getPlans）
export const PLAN_CONFIG: Record<string, { chatQuota: number; imageQuota: number; durationDays: number; label: string }> = {
  trial:     { chatQuota: 50,   imageQuota: 10,  durationDays: 7,  label: "体验卡（7天）" },
  monthly:   { chatQuota: 500,  imageQuota: 50,  durationDays: 30, label: "月卡（30天）" },
  quarterly: { chatQuota: 2000, imageQuota: 200, durationDays: 90, label: "季卡（90天）" },
};

export async function getPlans(): Promise<PlanConfig[]> {
  try {
    const redis = getRedis();
    const plans = await redis.get<PlanConfig[]>(PLANS_KEY);
    return (plans && plans.length > 0) ? plans : DEFAULT_PLANS;
  } catch {
    return DEFAULT_PLANS;
  }
}

export async function savePlans(plans: PlanConfig[]): Promise<void> {
  const redis = getRedis();
  await redis.set(PLANS_KEY, plans);
}

export const FREE_DAILY_LIMIT = 5;
export const FREE_TRIAL_DAYS = 30;

// ========== Redis Key ==========
const COUPON_PREFIX = "coupon:";
const QUOTA_PREFIX = "quota:";
const SETTINGS_KEY = "system_settings";

interface SystemSettings {
  freeTrialDays: number;
  freeDailyLimit: number;
  modelProvider: string;
  shareRewardChat: number;
  shareRewardImage: number;
}

export async function getSystemSettingsPublic(): Promise<SystemSettings> {
  return getSystemSettings();
}

async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const redis = getRedis();
    const settings = await redis.get<SystemSettings>(SETTINGS_KEY);
    return {
      freeTrialDays: settings?.freeTrialDays || FREE_TRIAL_DAYS,
      freeDailyLimit: settings?.freeDailyLimit || FREE_DAILY_LIMIT,
      modelProvider: (settings as any)?.modelProvider || "qwen",
      shareRewardChat: (settings as any)?.shareRewardChat || 29,
      shareRewardImage: (settings as any)?.shareRewardImage || 9,
    };
  } catch {
    return { freeTrialDays: FREE_TRIAL_DAYS, freeDailyLimit: FREE_DAILY_LIMIT, modelProvider: "qwen", shareRewardChat: 29, shareRewardImage: 9 };
  }
}

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
      // 套餐过期，降级为免费（保留试用期记录，防止重新获得试用期）
      const freeQuota: UserQuota = {
        plan: "free",
        chatRemaining: 0,
        imageRemaining: 0,
        expiresAt: null,
        redeemCode: null,
        dailyFreeUsed: existing.dailyFreeUsed,
        dailyFreeDate: existing.dailyFreeDate,
        freeTrialStarted: existing.freeTrialStarted,
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

  // 付费/体验用户检查
  if (quota.plan !== "free") {
    if (type === "chat" && quota.chatRemaining <= 0) return { allowed: false, reason: "套餐额度已用完，请续费", quota };
    if (type === "image" && quota.imageRemaining <= 0) return { allowed: false, reason: "套餐额度已用完，请续费", quota };

    // 所有付费套餐：每日消耗上限（从卡种配置读取）
    const plans = await getPlans();
    const planConfig = plans.find(p => p.id === quota.plan);
    const dailyLimit = planConfig?.dailyLimit || 999;
    const rewardDate = quota.rewardDailyDate || "";
    const rewardUsed = (rewardDate === today) ? (quota.rewardDailyUsed || 0) : 0;
    if (rewardUsed >= dailyLimit) {
      return { allowed: false, reason: `今日额度已达上限（${dailyLimit}次/天），明天再来吧`, quota };
    }

    return { allowed: true, quota };
  }

  // 从管理后台读取动态设置
  const settings = await getSystemSettings();

  // 检查免费试用期是否过期
  if (quota.freeTrialStarted) {
    const trialStart = new Date(quota.freeTrialStarted);
    const now = new Date();
    const daysSinceStart = (now.getTime() - trialStart.getTime()) / (1000 * 86400);
    if (daysSinceStart > settings.freeTrialDays) {
      return { allowed: false, reason: `免费试用期已结束（${settings.freeTrialDays}天），请兑换体验卡或购买套餐`, quota };
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

  if (quota.dailyFreeUsed < settings.freeDailyLimit) {
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

    // 所有付费套餐：递增每日消耗计数
    if (quota.rewardDailyDate !== today) {
      quota.rewardDailyUsed = 0;
      quota.rewardDailyDate = today;
    }
    quota.rewardDailyUsed = (quota.rewardDailyUsed || 0) + (type === "image" ? 2 : 1);
  } else {
    // 免费用户扣每日额度（生图消耗2次，因API成本更高）
    if (quota.dailyFreeDate !== today) {
      quota.dailyFreeUsed = 0;
      quota.dailyFreeDate = today;
    }
    quota.dailyFreeUsed += type === "image" ? 2 : 1;
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

  // 检查兑换码是否过期（未使用的兑换码有有效期）
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { success: false, message: "该兑换码已过期" };
  }

  // 单用户兑换上限：每个用户最多激活 50 个兑换码（防脚本批量刷码）
  const redeemCountKey = `redeem_count:${userId}`;
  const redeemCount = await redis.get<number>(redeemCountKey) || 0;
  if (redeemCount >= 50) {
    return { success: false, message: "您的兑换次数已达上限" };
  }

  // 标记兑换码为已使用
  coupon.usedBy = userId;
  coupon.usedAt = new Date().toISOString();
  await redis.set(couponKey, coupon);
  // 更新用户兑换计数
  const redeemCountKey2 = `redeem_count:${userId}`;
  await redis.incr(redeemCountKey2);

  // 计算过期时间
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + coupon.durationDays);

  // 获取当前配额，叠加（如果有剩余）
  const existing = await getUserQuota(userId);

  // 套餐优先级：从卡种配置读取 rank，高优先级不会被低优先级覆盖
  const plans = await getPlans();
  const getRank = (planId: string) => plans.find(p => p.id === planId)?.rank || 0;
  const keepPlan = (getRank(existing.plan) >= getRank(coupon.plan)) && existing.plan !== "free"
    ? existing.plan : coupon.plan;

  // 过期时间取更晚的那个
  const existingExpiry = existing.expiresAt ? new Date(existing.expiresAt) : new Date(0);
  const finalExpiry = existingExpiry > expiresAt ? existingExpiry : expiresAt;

  const newQuota: UserQuota = {
    plan: keepPlan,
    chatRemaining: (existing.plan !== "free" ? existing.chatRemaining : 0) + coupon.chatQuota,
    imageRemaining: (existing.plan !== "free" ? existing.imageRemaining : 0) + coupon.imageQuota,
    expiresAt: finalExpiry.toISOString(),
    redeemCode: code.toUpperCase(),
    dailyFreeUsed: existing.dailyFreeUsed,
    dailyFreeDate: existing.dailyFreeDate,
    freeTrialStarted: existing.freeTrialStarted,
  };

  await redis.set(`${QUOTA_PREFIX}${userId}`, newQuota);

  const planLabel = plans.find(p => p.id === coupon.plan)?.label || PLAN_CONFIG[coupon.plan]?.label || coupon.plan;
  return {
    success: true,
    message: `${planLabel} 激活成功！对话 ${newQuota.chatRemaining} 次 + 生图 ${newQuota.imageRemaining} 次`,
    quota: newQuota,
  };
}

// ========== 生成兑换码 ==========
export async function generateCoupons(
  plan: string,
  count: number,
  createdBy?: string
): Promise<string[]> {
  const redis = getRedis();
  const plans = await getPlans();
  const config = plans.find(p => p.id === plan) || PLAN_CONFIG[plan];
  const codes: string[] = [];

  // 同一批次共享 batchId 和有效期
  const batchId = `batch_${Date.now().toString(36)}`;
  const couponExpiry = new Date();
  couponExpiry.setDate(couponExpiry.getDate() + 90);
  const expiresAtStr = couponExpiry.toISOString();

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
      expiresAt: expiresAtStr,
      batchId,
      createdBy: createdBy || "super_admin",
    };

    await redis.set(`${COUPON_PREFIX}${code}`, coupon);
    codes.push(code);
  }

  // 写入兑换码索引（供后台列表查询）
  const existing = (await redis.get<string[]>("all_coupons")) || [];
  await redis.set("all_coupons", [...existing, ...codes]);

  return codes;
}

// ========== IP 级别每日额度（防绕过，读取动态设置） ==========
const IP_DAILY_PREFIX = "ip_daily:";

export async function canUseByIp(ip: string): Promise<boolean> {
  const redis = getRedis();
  const settings = await getSystemSettings();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${IP_DAILY_PREFIX}${ip}:${today}`;
  const used = await redis.get<number>(key);
  return (used || 0) < settings.freeDailyLimit;
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
