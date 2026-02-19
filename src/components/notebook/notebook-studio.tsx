"use client";

import { useState, useEffect, useRef } from "react";
import { useNotebookStore } from "@/store/notebook-store";
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Sparkles, Mic, Play, Pause, Volume2 } from "lucide-react";
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
    podcastData,
    generatingPodcast,
    fetchPodcast,
    generatePodcast,
  } = useNotebookStore();

  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [showPodcast, setShowPodcast] = useState(false);
  const enabledSources = sources.filter((s) => s.enabled);

  useEffect(() => {
    fetchPodcast(userId, notebookId);
  }, [userId, notebookId, fetchPodcast]);

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

        {/* 播客区域 */}
        {enabledSources.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Mic size={14} className="text-orange-500" />
              <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                播客
              </h4>
            </div>

            {showPodcast ? (
              <PodcastPanel
                notebookId={notebookId}
                userId={userId}
                podcastData={podcastData}
                generatingPodcast={generatingPodcast}
                generatePodcast={generatePodcast}
                onClose={() => setShowPodcast(false)}
              />
            ) : (
              <button
                onClick={() => setShowPodcast(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--border)] hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/30 dark:hover:bg-orange-900/10 transition-all"
              >
                <Volume2 size={14} className="text-orange-500" />
                <div className="flex-1 text-left">
                  <p className="text-[11px] font-medium">
                    {podcastData ? "播放播客" : "生成播客"}
                  </p>
                  <p className="text-[9px] text-[var(--muted)]">
                    {podcastData ? `${podcastData.mode === "dialogue" ? "对话模式" : "朗读模式"} · ${new Date(podcastData.generatedAt).toLocaleDateString("zh-CN")}` : "朗读模式 / 对话模式"}
                  </p>
                </div>
                <ChevronRight size={12} className="text-[var(--muted)]" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 播客面板 ==========
function PodcastPanel({
  notebookId,
  userId,
  podcastData,
  generatingPodcast,
  generatePodcast,
  onClose,
}: {
  notebookId: string;
  userId: string;
  podcastData: ReturnType<typeof useNotebookStore.getState>["podcastData"];
  generatingPodcast: boolean;
  generatePodcast: (userId: string, notebookId: string, mode: string, voices?: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"narration" | "dialogue">(podcastData?.mode || "narration");
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleGenerate = () => {
    generatePodcast(userId, notebookId, mode);
  };

  const handlePlay = () => {
    if (!podcastData?.segments?.length) return;

    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    setPlaying(true);
    playSegment(0);
  };

  const playSegment = (index: number) => {
    if (!podcastData?.segments || index >= podcastData.segments.length) {
      setPlaying(false);
      setCurrentSegment(0);
      return;
    }

    setCurrentSegment(index);
    const seg = podcastData.segments[index];
    const utterance = new SpeechSynthesisUtterance(seg.text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.0;

    // 根据角色选择不同音调
    if (seg.speaker === "Guest") {
      utterance.pitch = 0.8;
    } else if (seg.speaker === "Host") {
      utterance.pitch = 1.2;
    }

    utterance.onend = () => {
      playSegment(index + 1);
    };
    utterance.onerror = () => {
      setPlaying(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="space-y-2 animate-fade-in">
      {/* 模式选择 */}
      <div className="flex gap-1">
        {[
          { m: "narration" as const, label: "🎙 朗读模式", desc: "单人播报" },
          { m: "dialogue" as const, label: "🎭 对话模式", desc: "两人对话" },
        ].map(({ m, label, desc }) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 py-2 px-2 rounded-md text-[10px] text-center transition-colors",
              mode === m
                ? "bg-orange-500 text-white"
                : "bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--sidebar-hover)] border border-[var(--border)]"
            )}
          >
            <p className="font-medium">{label}</p>
            <p className="text-[8px] opacity-70">{desc}</p>
          </button>
        ))}
      </div>

      {/* 生成/播放按钮 */}
      <div className="flex gap-1.5">
        <button
          onClick={handleGenerate}
          disabled={generatingPodcast}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md bg-orange-500 text-white text-[10px] font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {generatingPodcast ? (
            <>
              <Loader2 size={10} className="animate-spin" />
              生成脚本中...
            </>
          ) : podcastData ? (
            <>
              <RefreshCw size={10} />
              重新生成
            </>
          ) : (
            <>
              <Mic size={10} />
              生成播客
            </>
          )}
        </button>
        {podcastData && (
          <button
            onClick={handlePlay}
            className={cn(
              "px-4 py-2 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1",
              playing
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-green-500 text-white hover:bg-green-600"
            )}
          >
            {playing ? <Pause size={10} /> : <Play size={10} />}
            {playing ? "暂停" : "播放"}
          </button>
        )}
      </div>

      {/* 播客脚本预览 */}
      {podcastData && (
        <div className="max-h-[200px] overflow-y-auto rounded-lg bg-[var(--card)] border border-[var(--border)] p-2">
          {podcastData.segments.map((seg, i) => (
            <div
              key={i}
              className={cn(
                "py-1 px-2 rounded text-[10px] mb-1 transition-colors",
                playing && currentSegment === i
                  ? "bg-orange-100 dark:bg-orange-900/30"
                  : ""
              )}
            >
              {podcastData.mode === "dialogue" && (
                <span className={cn(
                  "font-bold mr-1",
                  seg.speaker === "Host" ? "text-blue-500" : "text-green-500"
                )}>
                  {seg.speaker === "Host" ? "主持人:" : "嘉宾:"}
                </span>
              )}
              <span className="text-[var(--fg)]">{seg.text.slice(0, 100)}{seg.text.length > 100 ? "..." : ""}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full text-center text-[9px] text-[var(--muted)] hover:text-[var(--fg)] py-1"
      >
        收起
      </button>
    </div>
  );
}
