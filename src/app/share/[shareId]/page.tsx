"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import { BookOpen, Lock, Users, ChevronRight, MessageSquareMore } from "lucide-react";
import { IconMagicWand } from "@/components/app-icons";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface ShareData {
  notebook: {
    id: string;
    title: string;
    description: string;
    icon: string;
    sourceCount: number;
    ownerId: string;
  };
  studioOutputs: Record<string, { type: string; content: string; generatedAt: string }>;
  sources?: { id: string; type: string; title: string; summary: string }[];
  shareId: string;
  access: "preview" | "member";
  requireLogin?: boolean;
  isOwner: boolean;
  isMember: boolean;
  memberCount: number;
}

const STUDIO_LABELS: Record<string, { label: string; icon: string }> = {
  guide: { label: "学习指南", icon: "📋" },
  faq: { label: "常见问题", icon: "❓" },
  outline: { label: "大纲摘要", icon: "📊" },
  timeline: { label: "时间线", icon: "📅" },
  concepts: { label: "关键概念", icon: "🎯" },
  briefing: { label: "简报文档", icon: "📝" },
};

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const shareId = params.shareId as string;
  const { userId } = useChatStore();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedStudio, setExpandedStudio] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const url = `/api/share/${shareId}${userId ? `?userId=${userId}` : ""}`;
        const resp = await fetch(url);
        if (resp.ok) {
          setData(await resp.json());
        } else {
          const err = await resp.json();
          setError(err.error || "加载失败");
        }
      } catch {
        setError("网络错误");
      }
      setLoading(false);
    }
    load();
  }, [shareId, userId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-[var(--muted)] text-sm">加载中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--bg)] gap-3">
        <BookOpen size={40} className="text-[var(--muted)] opacity-30" />
        <p className="text-sm text-[var(--muted)]">{error || "知识库不存在"}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
        >
          返回首页
        </button>
      </div>
    );
  }

  const { notebook, studioOutputs, access, requireLogin, memberCount } = data;
  const studioEntries = Object.entries(studioOutputs);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{notebook.icon}</span>
            <div>
              <h1 className="text-lg font-bold">{notebook.title}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted)]">
                <span>{notebook.sourceCount} 个来源</span>
                <span className="flex items-center gap-1"><Users size={11} /> {memberCount} 成员</span>
                <span>{studioEntries.length} 个成果</span>
              </div>
            </div>
            <div className="flex-1" />
            {access === "member" ? (
              <button
                onClick={() => router.push(`/notebook/${notebook.id}`)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600"
              >
                <MessageSquareMore size={13} />
                进入讨论
              </button>
            ) : requireLogin ? (
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600"
              >
                <Lock size={13} />
                登录查看完整内容
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* 需要登录提示 */}
      {access === "preview" && requireLogin && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="max-w-4xl mx-auto px-4 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <Lock size={12} />
            登录后可查看完整内容、使用 AI 分析、参与讨论
          </div>
        </div>
      )}

      {/* Studio 成果展示 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {studioEntries.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted)]">
            <IconMagicWand size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">此知识库还没有生成内容</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)] mb-4">
              <IconMagicWand size={16} className="text-purple-500" />
              Studio 成果
            </h2>
            {studioEntries.map(([key, output]) => {
              const meta = STUDIO_LABELS[key] || { label: key, icon: "📄" };
              const isExpanded = expandedStudio === key;
              return (
                <div key={key} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
                  <button
                    onClick={() => setExpandedStudio(isExpanded ? null : key)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--sidebar-hover)]/50 transition-colors"
                  >
                    <span className="text-lg">{meta.icon}</span>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {new Date(output.generatedAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <ChevronRight size={16} className={cn("text-[var(--muted)] transition-transform", isExpanded && "rotate-90")} />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[var(--border)] animate-fade-in">
                      <div className="mt-3 prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>{output.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 来源列表（已登录用户） */}
        {data.sources && data.sources.length > 0 && (
          <div className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)] mb-4">
              <BookOpen size={16} className="text-blue-500" />
              来源资料（{data.sources.length} 个）
            </h2>
            <div className="grid gap-2">
              {data.sources.map((src) => (
                <div key={src.id} className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-lg bg-[var(--card)]">
                  <span className="text-sm">
                    {src.type === "url" ? "🌐" : src.type === "file" ? "📄" : "📝"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{src.title}</p>
                    <p className="text-[10px] text-[var(--muted)] line-clamp-1">{src.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
