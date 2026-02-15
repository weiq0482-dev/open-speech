"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Sliders } from "lucide-react";

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

  const [showApiKey, setShowApiKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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
          <Sliders size={18} className="text-gemini-blue" />
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
        {/* API 配置 */}
        <div className="p-4 border-b border-[var(--border)]">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            账户配置
          </h3>
          <div>
            <label className="block text-sm mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                placeholder="输入你的 API Key"
                className="w-full px-3 py-2 pr-16 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-gemini-blue"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1 rounded-lg hover:bg-[var(--sidebar-hover)]"
              >
                {showApiKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-1">
              填入你的专属 Key 即可使用 AI 服务
            </p>
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
            OpenSpeech v0.1.0 · Powered by Gemini
          </p>
        </div>
      </div>
    </aside>
  );
}
