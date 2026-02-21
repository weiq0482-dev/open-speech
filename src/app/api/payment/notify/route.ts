import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/notebook-utils";
import { generateCoupons, redeemCoupon } from "@/lib/quota-store";
import crypto from "crypto";
import type { PaymentOrder } from "../create/route";

const ORDER_PREFIX = "payment_order:";

function epaySign(params: Record<string, string>, key: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("md5").update(sorted + key).digest("hex");
}

// GET: 易支付异步回调（GET 请求）
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });

    const { sign, sign_type: _st, ...rest } = params;

    // 验证签名
    const redis = getRedis();
    const config = await redis.get<Record<string, string>>("site_config") || {};
    const key = config.epayKey || process.env.EPAY_KEY || "";
    if (!key) return new NextResponse("error: no key", { status: 500 });

    const expectedSign = epaySign(rest, key);
    if (sign !== expectedSign) {
      console.error("[Epay notify] sign mismatch", { sign, expectedSign });
      return new NextResponse("fail", { status: 200 });
    }

    // 只处理 trade_status=TRADE_SUCCESS
    if (params.trade_status !== "TRADE_SUCCESS") {
      return new NextResponse("success", { status: 200 });
    }

    const orderId = params.out_trade_no;
    const order = await redis.get<PaymentOrder>(`${ORDER_PREFIX}${orderId}`);
    if (!order) {
      console.error("[Epay notify] order not found:", orderId);
      return new NextResponse("success", { status: 200 }); // 返回success避免重复回调
    }

    if (order.status === "paid") {
      return new NextResponse("success", { status: 200 }); // 幂等
    }

    // 生成激活码并自动兑换
    const [couponCode] = await generateCoupons(order.plan, 1, `payment:${orderId}`);

    // 自动为用户激活
    await redeemCoupon(order.userId, couponCode);

    // 更新订单状态
    const updatedOrder: PaymentOrder = {
      ...order,
      status: "paid",
      couponCode,
      paidAt: new Date().toISOString(),
    };
    await redis.set(`${ORDER_PREFIX}${orderId}`, updatedOrder, { ex: 86400 * 30 });

    console.log(`[Epay notify] 支付成功 orderId=${orderId} userId=${order.userId} plan=${order.plan} coupon=${couponCode}`);
    return new NextResponse("success", { status: 200 });
  } catch (err) {
    console.error("[Epay notify]", err);
    return new NextResponse("fail", { status: 200 });
  }
}

// POST: 同样支持 POST 回调
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const fakeReq = new NextRequest(url, { method: "GET" });
  // 将 body 参数转为 query 参数处理
  try {
    const body = await req.text();
    const bodyParams = new URLSearchParams(body);
    bodyParams.forEach((v, k) => url.searchParams.set(k, v));
    return GET(new NextRequest(url, { method: "GET" }));
  } catch {
    return GET(fakeReq);
  }
}
