import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, QUOTA_PREFIX, ACCOUNT_PREFIX, getThreadUserIds, COUPON_PREFIX } from "@/lib/admin-utils";

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
    const userMap = new Map<string, UserInfo>();
    const userIdsToFetch = new Set<string>();

    // ───── 第一步：收集所有用户ID ─────
    
    // 数据源 1: 客服会话线程
    const allThreadUserIds = await getThreadUserIds();
    allThreadUserIds.forEach(id => userIdsToFetch.add(id));

    // 数据源 2: 邮箱账户索引（快速）
    const emailsFromIndex = (await redis.get<string[]>("all_accounts")) || [];

    // 数据源 2b: 单次调用 keys() 兼底未写入索引的老用户
    const scannedAccountKeys = await redis.keys(`${ACCOUNT_PREFIX}*`).catch(() => [] as string[]);
    const scannedEmails = scannedAccountKeys.map((k: string) => k.replace(ACCOUNT_PREFIX, ""));
    const allEmailsCombined = Array.from(new Set([...emailsFromIndex, ...scannedEmails]));

    // 数据源 3: 已使用兑换码的用户（限制数量）
    const allCoupons = (await redis.get<string[]>("all_coupons")) || [];
    const couponPromises = allCoupons.slice(0, 100).map(code => 
      redis.get<Record<string, unknown>>(`${COUPON_PREFIX}${code}`).catch(() => null)
    );
    const couponResults = await Promise.all(couponPromises);
    couponResults.forEach(coupon => {
      if (coupon?.usedBy) userIdsToFetch.add(coupon.usedBy as string);
    });

    // ───── 第二步：批量获取邮箱账户信息 ─────
    const accountPromises = allEmailsCombined.slice(0, 500).map(email =>
      redis.get<Record<string, unknown>>(`${ACCOUNT_PREFIX}${email}`).catch(() => null)
    );
    const accountResults = await Promise.all(accountPromises);
    
    const emailAccountMap = new Map<string, { email: string; userId: string; createdAt?: string; lastLogin?: string }>();
    accountResults.forEach((account, idx) => {
      if (account?.userId) {
        const uid = account.userId as string;
        userIdsToFetch.add(uid);
        emailAccountMap.set(uid, {
          email: allEmailsCombined[idx],
          userId: uid,
          createdAt: account.createdAt as string | undefined,
          lastLogin: account.lastLogin as string | undefined,
        });
      }
    });

    // ───── 第三步：批量获取用户配额和锁定状态 ─────
    const userIds = Array.from(userIdsToFetch);
    const quotaPromises = userIds.map(uid => 
      redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${uid}`).catch(() => null)
    );
    const lockedPromises = userIds.map(uid => 
      redis.get<string>(`locked:${uid}`).catch(() => null)
    );
    
    const [quotaResults, lockedResults] = await Promise.all([
      Promise.all(quotaPromises),
      Promise.all(lockedPromises),
    ]);

    // ───── 第四步：组装用户数据 ─────
    userIds.forEach((uid, idx) => {
      const quota = quotaResults[idx];
      const locked = lockedResults[idx];
      const accountInfo = emailAccountMap.get(uid);
      
      userMap.set(uid, buildUserInfo(uid, quota, locked, accountInfo));
    });

    const users = Array.from(userMap.values());
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
