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

    // ───── 数据源 1: 客服会话线程 ─────
    const allThreadUserIds = await getThreadUserIds();
    for (const userId of allThreadUserIds) {
      if (userMap.has(userId)) continue;
      try {
        const quota = await redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${userId}`);
        const locked = await redis.get<string>(`locked:${userId}`);
        userMap.set(userId, buildUserInfo(userId, quota, locked));
      } catch { /* skip */ }
    }

    // ───── 数据源 2: 已使用兑换码的用户 ─────
    const allCoupons = (await redis.get<string[]>("all_coupons")) || [];
    for (const code of allCoupons.slice(0, 500)) {
      try {
        const coupon = await redis.get<Record<string, unknown>>(`${COUPON_PREFIX}${code}`);
        if (coupon?.usedBy && !userMap.has(coupon.usedBy as string)) {
          const uid = coupon.usedBy as string;
          const quota = await redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${uid}`);
          const locked = await redis.get<string>(`locked:${uid}`);
          userMap.set(uid, buildUserInfo(uid, quota, locked));
        }
      } catch { /* skip */ }
    }

    // ───── 数据源 3: 邮箱账户（SCAN + 索引双重保障） ─────
    const emailsFromIndex = (await redis.get<string[]>("all_accounts")) || [];
    const discoveredEmails = new Set<string>(emailsFromIndex);

    // 用 Redis SCAN 扫描所有 account:* 键，不依赖索引
    let cursor = 0;
    for (let i = 0; i < 20; i++) {
      try {
        const [nextCursor, keys] = await redis.scan(cursor, { match: "account:*", count: 100 });
        for (const key of keys) {
          const email = (key as string).replace("account:", "");
          discoveredEmails.add(email);
        }
        cursor = Number(nextCursor);
        if (cursor === 0) break;
      } catch { break; }
    }

    // 自动修复索引：如果 SCAN 发现了索引中没有的邮箱，补写
    if (discoveredEmails.size > emailsFromIndex.length) {
      try {
        await redis.set("all_accounts", Array.from(discoveredEmails));
      } catch { /* best effort */ }
    }

    // 从邮箱账户读取用户信息
    for (const email of Array.from(discoveredEmails)) {
      try {
        const account = await redis.get<Record<string, unknown>>(`${ACCOUNT_PREFIX}${email}`);
        if (!account?.userId) continue;
        const uid = account.userId as string;

        if (userMap.has(uid)) {
          // 已存在 → 补充 email 等字段
          const existing = userMap.get(uid)!;
          if (!existing.email) existing.email = email;
          if (!existing.createdAt) existing.createdAt = (account.createdAt as string) || undefined;
          if (!existing.lastLogin) existing.lastLogin = (account.lastLogin as string) || undefined;
        } else {
          // 新用户
          const quota = await redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${uid}`);
          const locked = await redis.get<string>(`locked:${uid}`);
          userMap.set(uid, buildUserInfo(uid, quota, locked, {
            email,
            createdAt: (account.createdAt as string) || undefined,
            lastLogin: (account.lastLogin as string) || undefined,
          }));
        }
      } catch { /* skip */ }
    }

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
