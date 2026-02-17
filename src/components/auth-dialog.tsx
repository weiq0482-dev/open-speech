"use client";

import { useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { Mail, ArrowRight, Loader2, CheckCircle, X } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const userId = useChatStore((s) => s.userId);
  const login = useChatStore((s) => s.login);

  // 倒计时
  const startCountdown = useCallback(() => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // 发送验证码
  const handleSendCode = async () => {
    if (!email.trim() || loading) return;
    setError("");
    setLoading(true);

    try {
      const resp = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "发送失败");
        return;
      }

      setStep("code");
      startCountdown();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // 验证码校验
  const handleVerify = async () => {
    if (!code.trim() || loading) return;
    setError("");
    setLoading(true);

    try {
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          currentDeviceUserId: userId,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "验证失败");
        return;
      }

      // 登录成功
      login(data.token, email.trim().toLowerCase(), data.userId);
      setStep("done");

      // 1.5 秒后自动关闭
      setTimeout(() => {
        onClose();
        // 重置状态
        setStep("email");
        setEmail("");
        setCode("");
        setError("");
      }, 1500);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // 重新发送验证码
  const handleResend = async () => {
    if (countdown > 0 || loading) return;
    setError("");
    setLoading(true);

    try {
      const resp = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "发送失败");
        return;
      }

      startCountdown();
      setCode("");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition-colors"
        >
          <X size={18} />
        </button>

        {/* 步骤 1: 输入邮箱 */}
        {step === "email" && (
          <>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
                <Mail className="text-blue-500" size={24} />
              </div>
              <h3 className="text-lg font-semibold">登录 / 注册</h3>
              <p className="text-xs text-[var(--muted)]">
                输入邮箱，我们会发送验证码到您的邮箱
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleSendCode}
                disabled={!email.trim() || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    发送验证码
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

            <p className="text-[10px] text-[var(--muted)] text-center">
              登录即表示同意{" "}
              <a href="/terms" target="_blank" className="underline">
                用户协议
              </a>{" "}
              和{" "}
              <a href="/privacy" target="_blank" className="underline">
                隐私政策
              </a>
            </p>
          </>
        )}

        {/* 步骤 2: 输入验证码 */}
        {step === "code" && (
          <>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">输入验证码</h3>
              <p className="text-xs text-[var(--muted)]">
                验证码已发送到 <span className="font-medium text-[var(--foreground)]">{email}</span>
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
                placeholder="6 位验证码"
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleVerify}
                disabled={code.length !== 6 || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "验证并登录"
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => { setStep("email"); setCode(""); setError(""); }}
                className="text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                换个邮箱
              </button>
              <button
                onClick={handleResend}
                disabled={countdown > 0 || loading}
                className="text-blue-500 hover:text-blue-600 disabled:text-[var(--muted)] disabled:cursor-not-allowed"
              >
                {countdown > 0 ? `${countdown}s 后重新发送` : "重新发送"}
              </button>
            </div>
          </>
        )}

        {/* 步骤 3: 成功 */}
        {step === "done" && (
          <div className="text-center space-y-3 py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle className="text-green-500" size={28} />
            </div>
            <h3 className="text-lg font-semibold">登录成功</h3>
            <p className="text-sm text-[var(--muted)]">欢迎使用 OpenSpeech！</p>
          </div>
        )}
      </div>
    </div>
  );
}
