"use client";

import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Sliders, Zap, Key, Gift } from "lucide-react";

export function SettingsPanel() {
  const {
    settingsPanelOpen,
    toggleSettingsPanel,
    resetGenerationConfig,
    userApiKey,
    setUserApiKey,
    clearAllConversations,
    conversations,
  } = useChatStore();

  const userId = useChatStore((s) => s.userId);
  const [showApiKey, setShowApiKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<{ type: "success" | "error" | "loading"; msg: string } | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<{ plan: string; chatRemaining: number; imageRemaining: number; expiresAt: string | null; dailyFreeUsed: number; freeDailyLimit?: number; freeTrialStarted?: string; freeTrialDays?: number } | null>(null);

  // 检测是否是兑换码格式
  const isCouponFormat = (v: string) => /^OS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(v.trim());

  // 获取配额信息
  const fetchQuota = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(`/api/redeem?userId=${encodeURIComponent(userId)}`);
      if (r.ok) {
        const data = await r.json();
        setQuotaInfo(data.quota);
      }
    } catch {}
  }, [userId]);

  useEffect(() => { fetchQuota(); }, [fetchQuota]);

  // 处理输入提交
  const handleInputSubmit = async () => {
    const val = inputValue.trim();
    if (!val) return;

    if (isCouponFormat(val)) {
      // 兑换码模式
      setRedeemStatus({ type: "loading", msg: "正在验证兑换码..." });
      try {
        const r = await fetch("/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, code: val }),
        });
        const data = await r.json();
        if (r.ok && data.success) {
          setRedeemStatus({ type: "success", msg: data.message });
          setInputValue("");
          setUserApiKey(""); // 清除 API Key，使用平台 Key + 配额
          fetchQuota();
        } else {
          setRedeemStatus({ type: "error", msg: data.error || "兑换失败" });
        }
      } catch {
        setRedeemStatus({ type: "error", msg: "网络错误，请重试" });
      }
      setTimeout(() => setRedeemStatus(null), 5000);
    } else {
      // API Key 模式
      setUserApiKey(val);
      setInputValue("");
      setRedeemStatus({ type: "success", msg: "API Key 已保存" });
      setTimeout(() => setRedeemStatus(null), 3000);
    }
  };

  if (!settingsPanelOpen) return null;

  return (
    <aside
      className={cn(
        "shrink-0 h-full border-l border-[var(--border)] bg-[var(--sidebar-bg)]",
        "flex flex-col overflow-hidden animate-fade-in",
        "fixed inset-0 z-50 w-full border-l-0 md:relative md:z-auto md:w-[320px] md:border-l"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-blue-500" />
          <span className="font-semibold text-sm">设置</span>
        </div>
        <button
          onClick={toggleSettingsPanel}
          className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* 账户配置 */}
        <div className="p-4 border-b border-[var(--border)]">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            账户配置
          </h3>

          {/* 当前状态卡片 */}
          {quotaInfo && (
            <div className="mb-3 p-3 rounded-xl bg-[var(--sidebar-hover)] space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Zap size={14} className={quotaInfo.plan !== "free" ? "text-amber-500" : "text-[var(--muted)]"} />
                <span className="text-xs font-medium">
                  {quotaInfo.plan === "free" ? "免费用户" : quotaInfo.plan === "trial" ? "体验卡" : quotaInfo.plan === "monthly" ? "月卡" : "季卡"}
                </span>
                {quotaInfo.expiresAt && (
                  <span className="text-[10px] text-[var(--muted)] ml-auto">
                    {new Date(quotaInfo.expiresAt) > new Date() ? `${Math.ceil((new Date(quotaInfo.expiresAt).getTime() - Date.now()) / 86400000)}天后到期` : "已过期"}
                  </span>
                )}
              </div>
              {quotaInfo.plan !== "free" ? (
                <div className="flex gap-3 text-[10px] text-[var(--muted)]">
                  <span>对话剩余 <b className="text-[var(--foreground)]">{quotaInfo.chatRemaining}</b> 次</span>
                  <span>生图剩余 <b className="text-[var(--foreground)]">{quotaInfo.imageRemaining}</b> 次</span>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-[var(--muted)]">
                    每日免费 {quotaInfo.freeDailyLimit ?? 5} 次 · 已用 {quotaInfo.dailyFreeUsed} 次 · 生图消耗2次
                  </p>
                  {quotaInfo.freeTrialStarted && quotaInfo.freeTrialDays ? (() => {
                    const daysLeft = Math.max(0, Math.ceil(quotaInfo.freeTrialDays - (Date.now() - new Date(quotaInfo.freeTrialStarted!).getTime()) / 86400000));
                    return (
                      <p className={`text-[10px] ${daysLeft <= 3 ? "text-red-500 font-medium" : "text-[var(--muted)]"}`}>
                        {daysLeft > 0 ? `试用期剩余 ${daysLeft} 天` : "试用期已结束"}
                      </p>
                    );
                  })() : null}
                </>
              )}
            </div>
          )}

          {/* 已保存的 API Key 显示 */}
          {userApiKey && (
            <div className="mb-3 p-3 rounded-xl border border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Key size={14} className="text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">API Key 已配置</span>
                </div>
                <button
                  onClick={() => { setUserApiKey(""); fetchQuota(); }}
                  className="text-[10px] text-red-500 hover:text-red-600"
                >
                  清除
                </button>
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1">
                {showApiKey ? userApiKey : "••••••••" + userApiKey.slice(-6)}
                <button onClick={() => setShowApiKey(!showApiKey)} className="ml-2 text-blue-500">
                  {showApiKey ? "隐藏" : "显示"}
                </button>
              </p>
            </div>
          )}

          {/* 智能输入框 */}
          <div>
            <label className="block text-sm mb-1.5">
              {userApiKey ? "更换 Key / 兑换码" : "API Key / 兑换码"}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInputSubmit()}
                placeholder="输入 API Key 或兑换码 (OS-XXXX-XXXX)"
                className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
              />
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim() || redeemStatus?.type === "loading"}
                className={cn(
                  "px-3 py-2 rounded-xl text-white text-xs shrink-0 transition-colors",
                  inputValue.trim() && redeemStatus?.type !== "loading"
                    ? isCouponFormat(inputValue) ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-300 cursor-not-allowed"
                )}
              >
                {redeemStatus?.type === "loading" ? "..." : isCouponFormat(inputValue) ? "兑换" : "保存"}
              </button>
            </div>
            {inputValue && (
              <p className="text-[10px] mt-1 text-[var(--muted)]">
                {isCouponFormat(inputValue)
                  ? "🎁 检测到兑换码，点击「兑换」激活"
                  : "🔑 将作为 API Key 保存"}
              </p>
            )}
            {redeemStatus && (
              <p className={cn("text-[10px] mt-1 font-medium", redeemStatus.type === "success" ? "text-green-600" : redeemStatus.type === "error" ? "text-red-500" : "text-blue-500")}>
                {redeemStatus.msg}
              </p>
            )}
            {!inputValue && !userApiKey && (
              <p className="text-[10px] text-[var(--muted)] mt-1">
                填入 API Key 无限使用，或输入兑换码激活套餐
              </p>
            )}
          </div>
        </div>

        {/* 数据管理 */}
        <div className="p-4 border-t border-[var(--border)]">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            数据管理
          </h3>
          <div className="space-y-2">
            <button
              onClick={resetGenerationConfig}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors text-sm"
            >
              <RotateCcw size={14} />
              重置生成参数
            </button>
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={conversations.length === 0}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border transition-colors text-sm",
                  conversations.length > 0
                    ? "border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    : "border-[var(--border)] text-[var(--muted)] cursor-not-allowed"
                )}
              >
                清空所有对话（{conversations.length}）
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    clearAllConversations();
                    setConfirmClear(false);
                  }}
                  className="flex-1 px-3 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                >
                  确认清空
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--sidebar-hover)] transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 版本信息 */}
        <div className="p-4 border-t border-[var(--border)] text-center">
          <p className="text-[10px] text-[var(--muted)]">
            OpenSpeech v0.1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
