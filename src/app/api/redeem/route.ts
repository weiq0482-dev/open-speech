import { NextRequest, NextResponse } from "next/server";
import { redeemCoupon, getUserQuota, isCouponCode } from "@/lib/quota-store";

// POST: 兑换码激活
export async function POST(req: NextRequest) {
  try {
    const { userId, code } = await req.json();

    if (!userId || !code?.trim()) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (!isCouponCode(code.trim())) {
      return NextResponse.json({ error: "兑换码格式不正确，正确格式如 OS-XXXX-XXXX" }, { status: 400 });
    }

    const result = await redeemCoupon(userId, code.trim());

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      quota: result.quota,
    });
  } catch (err) {
    console.error("[POST /api/redeem]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// GET: 查询用户配额
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    const quota = await getUserQuota(userId);
    return NextResponse.json({ quota });
  } catch (err) {
    console.error("[GET /api/redeem]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
