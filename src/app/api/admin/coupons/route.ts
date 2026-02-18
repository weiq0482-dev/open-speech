import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, COUPON_PREFIX, ALL_COUPONS_KEY } from "@/lib/admin-utils";
import { PLAN_CONFIG } from "@/lib/quota-store";

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const allCodes = (await redis.get<string[]>(ALL_COUPONS_KEY)) || [];
    const coupons: Record<string, unknown>[] = [];

    for (const code of allCodes) {
      const data = await redis.get<Record<string, unknown>>(`${COUPON_PREFIX}${code}`);
      if (data) {
        const plan = data.plan as keyof typeof PLAN_CONFIG;
        coupons.push({
          code,
          plan: data.plan,
          planLabel: PLAN_CONFIG[plan]?.label || data.plan,
          createdAt: data.createdAt,
          usedBy: data.usedBy || null,
          usedAt: data.usedAt || null,
        });
      }
    }

    coupons.reverse();
    return NextResponse.json({ coupons });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
