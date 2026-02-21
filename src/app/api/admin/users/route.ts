import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, QUOTA_PREFIX, ACCOUNT_PREFIX } from "@/lib/admin-utils";

interface UserInfo {
  userId: string;
  email?: string;
  plan: string;
  chatRemaining: number;
  imageRemaining: number;
  dailyFreeUsed: number;
  dailyFreeDate: string;
  freeTrialStarted: string;
  redeemCode: string | null;
  locked: string | null;
  createdAt?: string;
  lastLogin?: string;
}

// 从 quota 记录构建用户信息（quota 可能不存在）
function buildUserInfo(
  userId: string,
  quota: Record<string, unknown> | null,
  locked: string | null,
  extra?: { email?: string; createdAt?: string; lastLogin?: string }
): UserInfo {
  return {
    userId,
    email: extra?.email,
    plan: quota ? ((quota.plan as string) || "free") : "free",
    chatRemaining: quota ? ((quota.chatRemaining as number) || 0) : 0,
    imageRemaining: quota ? ((quota.imageRemaining as number) || 0) : 0,
    dailyFreeUsed: quota ? ((quota.dailyFreeUsed as number) || 0) : 0,
    dailyFreeDate: quota ? ((quota.dailyFreeDate as string) || "") : "",
    freeTrialStarted: quota ? ((quota.freeTrialStarted as string) || "") : "",
    redeemCode: quota ? ((quota.redeemCode as string) || null) : null,
    locked: locked || null,
    createdAt: extra?.createdAt,
    lastLogin: extra?.lastLogin,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();

    // 只统计邮箱注册账户（去除设备指纹重复计数）
    const accountKeys = await redis.keys(`${ACCOUNT_PREFIX}*`).catch(() => [] as string[]);
    const accountDataList = await Promise.all(
      accountKeys.map(k => redis.get<Record<string, unknown>>(k).catch(() => null))
    );

    const emailAccountMap = new Map<string, { email: string; userId: string; createdAt?: string; lastLogin?: string }>();
    const userIds: string[] = [];
    accountDataList.forEach((account, idx) => {
      if (account?.userId) {
        const uid = account.userId as string;
        if (!emailAccountMap.has(uid)) { // 防止同一 userId 重复
          userIds.push(uid);
          emailAccountMap.set(uid, {
            email: accountKeys[idx].replace(ACCOUNT_PREFIX, ""),
            userId: uid,
            createdAt: account.createdAt as string | undefined,
            lastLogin: account.lastLogin as string | undefined,
          });
        }
      }
    });

    // 并行获取配额和锁定状态
    const [quotaResults, lockedResults] = await Promise.all([
      Promise.all(userIds.map(uid => redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${uid}`).catch(() => null))),
      Promise.all(userIds.map(uid => redis.get<string>(`locked:${uid}`).catch(() => null))),
    ]);

    const users = userIds.map((uid, idx) =>
      buildUserInfo(uid, quotaResults[idx], lockedResults[idx], emailAccountMap.get(uid))
    );

    users.sort((a, b) => {
      const dateA = a.lastLogin || a.dailyFreeDate || a.createdAt || "";
      const dateB = b.lastLogin || b.dailyFreeDate || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });

    const today = new Date().toISOString().slice(0, 10);
    const suspicious = users.filter((u) =>
      u.plan === "free" && u.dailyFreeUsed >= 4 && u.dailyFreeDate === today
    );

    return NextResponse.json({ total: users.length, users, suspicious, today });
  } catch (err) {
    console.error("[admin/users] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
