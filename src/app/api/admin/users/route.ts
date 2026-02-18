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
  deviceIds?: string[];
}

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const allThreadUserIds = await getThreadUserIds();

    // 收集所有已知用户
    const userMap = new Map<string, UserInfo>();

    // 1. 从会话线程收集用户
    for (const userId of allThreadUserIds) {
      try {
        const quota = await redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${userId}`);
        const locked = await redis.get<string>(`locked:${userId}`);
        if (quota) {
          userMap.set(userId, {
            userId,
            plan: (quota.plan as string) || "free",
            chatRemaining: (quota.chatRemaining as number) || 0,
            imageRemaining: (quota.imageRemaining as number) || 0,
            dailyFreeUsed: (quota.dailyFreeUsed as number) || 0,
            dailyFreeDate: (quota.dailyFreeDate as string) || "",
            freeTrialStarted: (quota.freeTrialStarted as string) || "",
            redeemCode: (quota.redeemCode as string) || null,
            locked: locked || null,
          });
        }
      } catch { /* skip */ }
    }

    // 2. 从兑换码中补充绑定的用户
    const allCoupons = (await redis.get<string[]>("all_coupons")) || [];
    for (const code of allCoupons.slice(0, 200)) {
      try {
        const coupon = await redis.get<Record<string, unknown>>(`${COUPON_PREFIX}${code}`);
        if (coupon?.usedBy && !userMap.has(coupon.usedBy as string)) {
          const uid = coupon.usedBy as string;
          const quota = await redis.get<Record<string, unknown>>(`${QUOTA_PREFIX}${uid}`);
          const locked = await redis.get<string>(`locked:${uid}`);
          if (quota) {
            userMap.set(uid, {
              userId: uid,
              plan: (quota.plan as string) || "free",
              chatRemaining: (quota.chatRemaining as number) || 0,
              imageRemaining: (quota.imageRemaining as number) || 0,
              dailyFreeUsed: (quota.dailyFreeUsed as number) || 0,
              dailyFreeDate: (quota.dailyFreeDate as string) || "",
              freeTrialStarted: (quota.freeTrialStarted as string) || "",
              redeemCode: (quota.redeemCode as string) || null,
              locked: locked || null,
            });
          }
        }
      } catch { /* skip */ }
    }

    const users = Array.from(userMap.values());
    // 按最近活跃排序
    users.sort((a, b) => {
      const dateA = a.dailyFreeDate || a.freeTrialStarted || "";
      const dateB = b.dailyFreeDate || b.freeTrialStarted || "";
      return dateB.localeCompare(dateA);
    });

    // 异常检测
    const today = new Date().toISOString().slice(0, 10);
    const suspicious = users.filter((u) => {
      if (u.plan === "free" && u.dailyFreeUsed >= 4 && u.dailyFreeDate === today) return true;
      return false;
    });

    return NextResponse.json({
      total: users.length,
      users,
      suspicious,
      today,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
