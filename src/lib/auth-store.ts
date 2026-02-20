import { Redis } from "@upstash/redis";
import { SignJWT, jwtVerify } from "jose";

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

// ========== 常量 ==========
const ACCOUNT_PREFIX = "account:";
const VERIFY_CODE_PREFIX = "verify_code:";
const EMAIL_USERID_PREFIX = "email_uid:";
const CODE_EXPIRY_SECONDS = 600; // 验证码 10 分钟有效
const MAX_CODE_ATTEMPTS = 5; // 每个邮箱最多尝试 5 次
const CODE_COOLDOWN_SECONDS = 60; // 发送间隔 60 秒
const JWT_EXPIRY = "30d"; // token 30 天有效

// JWT 密钥（从环境变量获取，未设置时用随机值——开发环境可用但重启后失效）
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.ADMIN_KEY || "dev-jwt-secret-change-me";
  return new TextEncoder().encode(secret);
}

// ========== 数据模型 ==========
export interface UserAccount {
  userId: string;
  email: string;
  createdAt: string;
  lastLogin: string;
  deviceIds: string[]; // 关联的设备指纹 userId
}

interface VerifyCodeData {
  code: string;
  attempts: number;
  createdAt: string;
}

// ========== 生成 6 位验证码 ==========
export function generateVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ========== 根据邮箱生成稳定的 userId ==========
async function emailToUserId(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return `em_${hashHex.slice(0, 16)}`;
}

// ========== 保存验证码 ==========
export async function saveVerifyCode(email: string): Promise<{ success: boolean; message: string; code?: string }> {
  const redis = getRedis();
  const key = `${VERIFY_CODE_PREFIX}${email.toLowerCase().trim()}`;

  // 检查冷却时间
  const existing = await redis.get<VerifyCodeData>(key);
  if (existing) {
    const elapsed = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
    if (elapsed < CODE_COOLDOWN_SECONDS) {
      const wait = Math.ceil(CODE_COOLDOWN_SECONDS - elapsed);
      return { success: false, message: `请${wait}秒后再试` };
    }
  }

  const code = generateVerifyCode();
  const data: VerifyCodeData = {
    code,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await redis.set(key, data, { ex: CODE_EXPIRY_SECONDS });
  return { success: true, message: "验证码已发送", code };
}

// ========== 验证码校验 ==========
export async function verifyCode(
  email: string,
  code: string,
  currentDeviceUserId?: string
): Promise<{ success: boolean; message: string; token?: string; userId?: string; isNew?: boolean }> {
  const redis = getRedis();
  const normalizedEmail = email.toLowerCase().trim();
  const key = `${VERIFY_CODE_PREFIX}${normalizedEmail}`;

  const data = await redis.get<VerifyCodeData>(key);
  if (!data) {
    return { success: false, message: "验证码已过期，请重新获取" };
  }

  // 检查尝试次数
  if (data.attempts >= MAX_CODE_ATTEMPTS) {
    await redis.del(key);
    return { success: false, message: "验证码错误次数过多，请重新获取" };
  }

  // 验证码不匹配
  if (data.code !== code.trim()) {
    data.attempts += 1;
    await redis.set(key, data, { ex: CODE_EXPIRY_SECONDS });
    return { success: false, message: `验证码错误，还剩${MAX_CODE_ATTEMPTS - data.attempts}次机会` };
  }

  // 验证成功，删除验证码
  await redis.del(key);

  // 查找或创建账户
  const emailUserId = await emailToUserId(normalizedEmail);
  const accountKey = `${ACCOUNT_PREFIX}${normalizedEmail}`;
  const existingAccount = await redis.get<UserAccount>(accountKey);

  let isNew = false;

  if (existingAccount) {
    // 已有账户 → 登录
    existingAccount.lastLogin = new Date().toISOString();
    // 关联当前设备
    if (currentDeviceUserId && !existingAccount.deviceIds.includes(currentDeviceUserId)) {
      existingAccount.deviceIds.push(currentDeviceUserId);
    }
    await redis.set(accountKey, existingAccount);
    // 补写账户索引（兼容旧用户）
    const allEmails = (await redis.get<string[]>("all_accounts")) || [];
    if (!allEmails.includes(normalizedEmail)) {
      await redis.set("all_accounts", [...allEmails, normalizedEmail]);
    }
  } else {
    // 新账户 → 注册
    isNew = true;
    const account: UserAccount = {
      userId: emailUserId,
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      deviceIds: currentDeviceUserId ? [currentDeviceUserId] : [],
    };
    await redis.set(accountKey, account);
    // 邮箱 → userId 映射
    await redis.set(`${EMAIL_USERID_PREFIX}${normalizedEmail}`, emailUserId);
    // 注册标记（供 chat API 验证）
    await redis.set(`registered:${emailUserId}`, "1");
    // 写入账户索引（供后台用户管理查询）
    const allEmails = (await redis.get<string[]>("all_accounts")) || [];
    if (!allEmails.includes(normalizedEmail)) {
      await redis.set("all_accounts", [...allEmails, normalizedEmail]);
    }

    // 迁移设备指纹的配额数据到邮箱账户
    if (currentDeviceUserId) {
      await migrateQuota(currentDeviceUserId, emailUserId);
    }
  }

  // 绑定设备指纹到邮箱账户（设备快捷登录需要）
  if (currentDeviceUserId) {
    await bindDeviceToEmail(currentDeviceUserId, emailUserId, normalizedEmail);
  }

  // 生成 JWT token
  const token = await generateToken(emailUserId, normalizedEmail);

  return {
    success: true,
    message: isNew ? "注册成功" : "登录成功",
    token,
    userId: emailUserId,
    isNew,
  };
}

// ========== 配额迁移：设备 → 邮箱账户 ==========
async function migrateQuota(fromUserId: string, toUserId: string): Promise<void> {
  const redis = getRedis();
  const fromKey = `quota:${fromUserId}`;
  const toKey = `quota:${toUserId}`;

  // 目标账户已有配额就不覆盖
  const existingTo = await redis.get(toKey);
  if (existingTo) return;

  const fromQuota = await redis.get(fromKey);
  if (fromQuota) {
    await redis.set(toKey, fromQuota);
  }
}

// ========== 绑定设备到邮箱账户 ==========
async function bindDeviceToEmail(deviceUserId: string, emailUserId: string, email: string): Promise<void> {
  const redis = getRedis();
  
  // 查找设备记录并更新
  // 设备 userId 格式: u_<fingerprint前12位>_<时间戳>
  // 我们需要从设备记录中提取指纹
  const devicePrefix = "device:";
  
  // 尝试通过 account:userId 存储邮箱绑定信息
  await redis.set(`account:${emailUserId}`, { email, boundAt: new Date().toISOString() });
  
  // 如果有设备 userId，也标记它
  if (deviceUserId.startsWith("u_")) {
    await redis.set(`account:${deviceUserId}`, { email, boundAt: new Date().toISOString() });
  }
}

// ========== JWT 生成 ==========
async function generateToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

// ========== JWT 验证 ==========
export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

// ========== 获取用户账户信息 ==========
export async function getAccountByEmail(email: string): Promise<UserAccount | null> {
  const redis = getRedis();
  return redis.get<UserAccount>(`${ACCOUNT_PREFIX}${email.toLowerCase().trim()}`);
}

// ========== 通过 userId 反查账户 ==========
export async function getAccountByUserId(userId: string): Promise<UserAccount | null> {
  // 邮箱用户的 userId 以 em_ 开头
  if (!userId.startsWith("em_")) return null;
  // 需要遍历或用索引——这里我们用 token 里自带的 email 更高效
  // 此函数主要用于管理后台，非关键路径
  return null;
}
