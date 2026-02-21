import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId } from "@/lib/notebook-utils";
import { getPlans, generateCoupons } from "@/lib/quota-store";
import crypto from "crypto";

// 易支付订单 Redis Key
const ORDER_PREFIX = "payment_order:";

export interface PaymentOrder {
  orderId: string;
  userId: string;
  plan: string;
  amount: number;       // 单位：元
  payType: "wxpay" | "alipay";
  status: "pending" | "paid" | "failed";
  couponCode?: string;  // 支付成功后生成的激活码
  createdAt: string;
  paidAt?: string;
  qrUrl?: string;       // 支付二维码URL
  payUrl?: string;      // 支付跳转URL
}

// 获取易支付配置（从 Redis site_config 读取）
async function getEpayConfig() {
  const redis = getRedis();
  const config = await redis.get<Record<string, string>>("site_config") || {};
  return {
    apiUrl: (config.epayApiUrl || process.env.EPAY_API_URL || "").replace(/\/$/, ""),
    pid: config.epayPid || process.env.EPAY_PID || "",
    key: config.epayKey || process.env.EPAY_KEY || "",
    notifyUrl: config.epayNotifyUrl || process.env.EPAY_NOTIFY_URL || "",
    returnUrl: config.epayReturnUrl || process.env.EPAY_RETURN_URL || "",
  };
}

// 易支付签名算法：参数按ASCII升序排列，拼接key后MD5
function epaySign(params: Record<string, string>, key: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("md5").update(sorted + key).digest("hex");
}

// 生成唯一订单号
function genOrderId(): string {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `OS${ts}${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, payType } = await req.json();

    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }
    if (!plan || !payType) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const redis = getRedis();
    const plans = await getPlans();
    const planConfig = plans.find((p) => p.id === plan);
    if (!planConfig) {
      return NextResponse.json({ error: "套餐不存在" }, { status: 400 });
    }

    // 从套餐配置读取价格（需在套餐配置中加 price 字段，默认按天数估算）
    const priceMap: Record<string, number> = {
      trial: 9.9,
      monthly: 29.9,
      quarterly: 79.9,
      yearly: 199.9,
    };
    const amount = (planConfig as any).price || priceMap[plan] || 9.9;

    const epay = await getEpayConfig();
    if (!epay.apiUrl || !epay.pid || !epay.key) {
      return NextResponse.json({ error: "支付未配置，请联系管理员" }, { status: 503 });
    }

    const orderId = genOrderId();
    const params: Record<string, string> = {
      pid: epay.pid,
      type: payType === "wxpay" ? "wxpay" : "alipay",
      out_trade_no: orderId,
      notify_url: epay.notifyUrl,
      return_url: epay.returnUrl,
      name: planConfig.label,
      money: amount.toFixed(2),
      clientip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
      device: "pc",
    };
    params.sign = epaySign(params, epay.key);
    params.sign_type = "MD5";

    // 调用易支付接口获取二维码
    const epayResp = await fetch(`${epay.apiUrl}/submit.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(10000),
    });

    let qrUrl = "";
    let payUrl = "";
    if (epayResp.ok) {
      const result = await epayResp.json();
      if (result.code === 1) {
        qrUrl = result.qrcode || "";
        payUrl = result.payurl || result.urlscheme || "";
      } else {
        console.error("[Epay create]", result);
        return NextResponse.json({ error: result.msg || "创建支付订单失败" }, { status: 502 });
      }
    } else {
      return NextResponse.json({ error: "支付网关请求失败" }, { status: 502 });
    }

    // 保存订单到 Redis（30分钟过期）
    const order: PaymentOrder = {
      orderId,
      userId,
      plan,
      amount,
      payType,
      status: "pending",
      createdAt: new Date().toISOString(),
      qrUrl,
      payUrl,
    };
    await redis.set(`${ORDER_PREFIX}${orderId}`, order, { ex: 1800 });

    return NextResponse.json({
      success: true,
      orderId,
      qrUrl,
      payUrl,
      amount,
      planLabel: planConfig.label,
    });
  } catch (err) {
    console.error("[POST /api/payment/create]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
