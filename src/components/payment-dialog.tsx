"use client";

import { useState, useEffect, useRef } from "react";
import { X, QrCode, CheckCircle, Loader2, Smartphone, CreditCard, Zap, Star, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanOption {
  id: string;
  label: string;
  chatQuota: number;
  imageQuota: number;
  durationDays: number;
  dailyLimit: number;
  price?: number;
  color?: string;
}

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: (couponCode: string) => void;
}

const PLAN_PRICES: Record<string, number> = {
  trial: 9.9,
  monthly: 29.9,
  quarterly: 79.9,
  yearly: 199.9,
};

const PLAN_ICONS: Record<string, React.ReactNode> = {
  trial: <Zap size={16} />,
  monthly: <Star size={16} />,
  quarterly: <Crown size={16} />,
  yearly: <Crown size={16} />,
};

const PLAN_COLORS: Record<string, string> = {
  trial: "blue",
  monthly: "amber",
  quarterly: "purple",
  yearly: "rose",
};

export function PaymentDialog({ open, onClose, userId, onSuccess }: PaymentDialogProps) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [payType, setPayType] = useState<"wxpay" | "alipay">("wxpay");
  const [step, setStep] = useState<"select" | "qrcode" | "success">("select");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [amount, setAmount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载套餐列表
  useEffect(() => {
    if (!open) return;
    fetch("/api/redeem?userId=" + encodeURIComponent(userId))
      .then((r) => r.json())
      .then((d) => {
        if (d.plans && d.plans.length > 0) {
          setPlans(d.plans);
          setSelectedPlan(d.plans[0].id);
        }
      })
      .catch(() => {});
  }, [open, userId]);

  // 重置状态
  useEffect(() => {
    if (open) {
      setStep("select");
      setOrderId("");
      setQrUrl("");
      setCouponCode("");
      setPollCount(0);
    } else {
      stopPoll();
    }
  }, [open]);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // 轮询订单状态
  const startPoll = (oid: string) => {
    stopPoll();
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      if (count > 60) { // 最多轮询5分钟
        stopPoll();
        return;
      }
      try {
        const resp = await fetch(`/api/payment/query?orderId=${oid}&userId=${encodeURIComponent(userId)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.status === "paid" && data.couponCode) {
            stopPoll();
            setCouponCode(data.couponCode);
            setStep("success");
            onSuccess?.(data.couponCode);
          }
        }
      } catch {}
    }, 5000);
  };

  const handleCreateOrder = async () => {
    if (!selectedPlan) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan: selectedPlan, payType }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        alert(data.error || "创建订单失败，请稍后重试");
        return;
      }
      setOrderId(data.orderId);
      setQrUrl(data.qrUrl);
      setAmount(data.amount);
      setStep("qrcode");
      startPoll(data.orderId);
    } catch {
      alert("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    stopPoll();
    onClose();
  };

  const planConfig = plans.find((p) => p.id === selectedPlan);
  const price = planConfig ? ((planConfig as any).price || PLAN_PRICES[selectedPlan] || 9.9) : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold">充值套餐</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-[var(--sidebar-hover)] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 步骤1：选择套餐 */}
        {step === "select" && (
          <div className="p-5 space-y-4">
            {/* 套餐列表 */}
            <div className="space-y-2">
              {plans.map((plan) => {
                const planPrice = (plan as any).price || PLAN_PRICES[plan.id] || 9.9;
                const color = plan.color || PLAN_COLORS[plan.id] || "blue";
                const isSelected = selectedPlan === plan.id;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                      isSelected
                        ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/20`
                        : "border-[var(--border)] hover:border-[var(--muted)] bg-transparent"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      isSelected ? `bg-${color}-500 text-white` : "bg-[var(--sidebar-hover)] text-[var(--muted)]"
                    )}>
                      {PLAN_ICONS[plan.id] || <Zap size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{plan.label}</span>
                        {plan.id === "quarterly" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium">推荐</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--muted)] mt-0.5">
                        对话 {plan.chatQuota} 次 · 生图 {plan.imageQuota} 次 · {plan.durationDays} 天有效
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={cn("text-lg font-bold", isSelected ? `text-${color}-600 dark:text-${color}-400` : "text-[var(--fg)]")}>
                        ¥{planPrice}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 支付方式 */}
            <div>
              <p className="text-xs text-[var(--muted)] mb-2 font-medium">支付方式</p>
              <div className="flex gap-2">
                {[
                  { id: "wxpay" as const, label: "微信支付", color: "green", emoji: "💚" },
                  { id: "alipay" as const, label: "支付宝", color: "blue", emoji: "💙" },
                ].map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setPayType(pt.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                      payType === pt.id
                        ? `border-${pt.color}-500 bg-${pt.color}-50 dark:bg-${pt.color}-900/20 text-${pt.color}-600`
                        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    )}
                  >
                    <span>{pt.emoji}</span>
                    <span>{pt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 确认按钮 */}
            <button
              onClick={handleCreateOrder}
              disabled={loading || !selectedPlan || plans.length === 0}
              className="w-full py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" />创建订单中...</>
              ) : (
                <>立即支付 ¥{price.toFixed(2)}</>
              )}
            </button>

            <p className="text-center text-[11px] text-[var(--muted)]">
              支付成功后激活码将自动填入，无需手动操作
            </p>
          </div>
        )}

        {/* 步骤2：扫码支付 */}
        {step === "qrcode" && (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <p className="text-sm font-medium mb-1">
                {payType === "wxpay" ? "💚 微信扫码支付" : "💙 支付宝扫码支付"}
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                {planConfig?.label} · ¥{amount.toFixed(2)}
              </p>
            </div>

            {/* 二维码区域 */}
            <div className="flex flex-col items-center gap-3">
              {qrUrl ? (
                <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                    alt="支付二维码"
                    width={180}
                    height={180}
                    className="rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-[180px] h-[180px] rounded-xl border border-[var(--border)] flex items-center justify-center bg-[var(--sidebar-hover)]">
                  <QrCode size={48} className="text-[var(--muted)] opacity-40" />
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <Loader2 size={12} className="animate-spin" />
                <span>等待支付中... ({Math.min(pollCount * 5, 300)}s)</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--sidebar-hover)] text-[11px] text-[var(--muted)] space-y-1">
              <p>📱 打开{payType === "wxpay" ? "微信" : "支付宝"}，扫描上方二维码</p>
              <p>✅ 支付成功后页面将自动跳转，无需刷新</p>
              <p>🔒 订单号：{orderId}</p>
            </div>

            <button
              onClick={() => { stopPoll(); setStep("select"); }}
              className="w-full py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--muted)] hover:bg-[var(--sidebar-hover)] transition-colors"
            >
              返回重选
            </button>
          </div>
        )}

        {/* 步骤3：支付成功 */}
        {step === "success" && (
          <div className="p-5 space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={36} className="text-green-500" />
              </div>
              <h3 className="text-base font-bold text-green-600 dark:text-green-400 mb-1">支付成功！</h3>
              <p className="text-[12px] text-[var(--muted)]">套餐已自动激活，额度已到账</p>
            </div>

            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-[11px] text-green-600 dark:text-green-400 mb-1 font-medium">激活码（已自动使用）</p>
              <p className="font-mono text-sm font-bold text-green-700 dark:text-green-300 tracking-wider">{couponCode}</p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--sidebar-hover)] text-[11px] text-[var(--muted)] space-y-1">
              <p>✅ 套餐：{planConfig?.label}</p>
              <p>💬 对话次数：{planConfig?.chatQuota} 次</p>
              <p>🎨 生图次数：{planConfig?.imageQuota} 次</p>
              <p>📅 有效期：{planConfig?.durationDays} 天</p>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors"
            >
              开始使用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
