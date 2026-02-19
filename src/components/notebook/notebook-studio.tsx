"use client";

import { useState } from "react";
import { useNotebookStore } from "@/store/notebook-store";
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

export function NotebookStudio({
  notebookId,
  userId,
}: {
  notebookId: string;
  userId: string;
}) {
  const {
    studioTypes,
    studioOutputs,
    generatingStudio,
    generateStudio,
    sources,
  } = useNotebookStore();

  const [expandedType, setExpandedType] = useState<string | null>(null);
  const enabledSources = sources.filter((s) => s.enabled);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-purple-500" />
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            Studio
          </h3>
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-1">
          基于来源自动生成内容
        </p>
      </div>

      {/* Studio 类型列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {enabledSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--muted)]">
            <Sparkles size={28} className="mb-2 opacity-30" />
            <p className="text-xs text-center">
              添加来源后即可生成内容
            </p>
          </div>
        ) : studioTypes.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[var(--muted)] text-xs">
            加载中...
          </div>
        ) : (
          <div className="space-y-1.5">
            {studioTypes.map((st) => {
              const output = studioOutputs[st.key];
              const isExpanded = expandedType === st.key;
              const isGenerating = generatingStudio === st.key;

              return (
                <div
                  key={st.key}
                  className={cn(
                    "rounded-lg border transition-all",
                    output
                      ? "border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10"
                      : "border-[var(--border)]"
                  )}
                >
                  {/* 类型头部 */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <span className="text-base">{st.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium">{st.label}</p>
                      {output && (
                        <p className="text-[9px] text-[var(--muted)]">
                          {new Date(output.generatedAt).toLocaleString("zh-CN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1">
                      {output && (
                        <button
                          onClick={() => setExpandedType(isExpanded ? null : st.key)}
                          className="p-1 rounded hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      )}
                      <button
                        onClick={() => generateStudio(userId, notebookId, st.key)}
                        disabled={!!generatingStudio}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                          output
                            ? "text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
                            : "bg-purple-500 text-white hover:bg-purple-600",
                          generatingStudio && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            生成中
                          </>
                        ) : output ? (
                          <>
                            <RefreshCw size={10} />
                            重新生成
                          </>
                        ) : (
                          "生成"
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 展开内容 */}
                  {isExpanded && output && (
                    <div className="px-3 pb-3 border-t border-[var(--border)] animate-fade-in">
                      <div className="mt-2 max-h-[400px] overflow-y-auto rounded-lg bg-[var(--card)] p-3">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{output.content}</ReactMarkdown>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(output.content);
                          }}
                          className="px-2 py-1 rounded text-[9px] text-[var(--muted)] hover:bg-[var(--sidebar-hover)] transition-colors"
                        >
                          📋 复制
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
