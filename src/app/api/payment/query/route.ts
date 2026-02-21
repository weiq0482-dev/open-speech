import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId } from "@/lib/notebook-utils";
import type { PaymentOrder } from "../create/route";

const ORDER_PREFIX = "payment_order:";

// GET: 查询订单状态（前端轮询用）
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    const userId = req.nextUrl.searchParams.get("userId");

    if (!orderId || !userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const redis = getRedis();
    const order = await redis.get<PaymentOrder>(`${ORDER_PREFIX}${orderId}`);

    if (!order) {
      return NextResponse.json({ error: "订单不存在或已过期" }, { status: 404 });
    }

    // 安全校验：只能查自己的订单
    if (order.userId !== userId) {
      return NextResponse.json({ error: "无权查询" }, { status: 403 });
    }

    return NextResponse.json({
      status: order.status,
      couponCode: order.status === "paid" ? order.couponCode : undefined,
      paidAt: order.paidAt,
      plan: order.plan,
      amount: order.amount,
    });
  } catch (err) {
    console.error("[GET /api/payment/query]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
