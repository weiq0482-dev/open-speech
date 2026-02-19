"use client";

import { useState, useCallback } from "react";
import { useChatStore } from "@/store/chat-store";
import { Mail, ArrowRight, Loader2, CheckCircle, Smartphone } from "lucide-react";
import { AppLogo } from "@/components/app-icons";
import { generateDeviceFingerprint } from "@/lib/device-fingerprint";

export function LoginPage() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const userId = useChatStore((s) => s.userId);
  const login = useChatStore((s) => s.login);
  const loginAsDevice = useChatStore((s) => s.loginAsDevice);
  const setUserId = useChatStore((s) => s.setUserId);
  const [deviceLoading, setDeviceLoading] = useState(false);

  const handleDeviceLogin = async () => {
    if (deviceLoading) return;
    setDeviceLoading(true);
    setError("");
    try {
      const fingerprint = await generateDeviceFingerprint();
      // 8秒超时保护，防止请求挂起导致无限转圈
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        if (data.userId) {
          setUserId(data.userId);
          loginAsDevice(data.userId);
        } else {
          setError("设备注册异常，请使用邮箱登录");
        }
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.error || "设备登录失败，请使用邮箱登录");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("连接超时，请检查网络后重试或使用邮箱登录");
      } else {
        setError("网络错误，请稍后重试");
      }
    } finally {
      setDeviceLoading(false);
    }
  };

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

      login(data.token, email.trim().toLowerCase(), data.userId);
      setStep("done");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <AppLogo size={32} white />
          </div>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          OpenSpeech
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          你的 AI 智能助手
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm bg-[var(--card)] rounded-2xl shadow-xl border border-[var(--border)] p-6 space-y-5">
        {/* 步骤 1: 输入邮箱 */}
        {step === "email" && (
          <>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
                <Mail className="text-blue-500" size={24} />
              </div>
              <h3 className="text-lg font-semibold">欢迎使用</h3>
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

            <div className="relative flex items-center my-1">
              <div className="flex-1 border-t border-[var(--border)]" />
              <span className="px-3 text-[10px] text-[var(--muted)]">或</span>
              <div className="flex-1 border-t border-[var(--border)]" />
            </div>

            <button
              onClick={handleDeviceLogin}
              disabled={deviceLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-[var(--sidebar-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deviceLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Smartphone size={16} />
                  使用当前设备登录
                </>
              )}
            </button>

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

      {/* Footer */}
      <p className="mt-8 text-xs text-[var(--muted)]">
        Powered by Gemini AI
      </p>
    </div>
  );
}
