"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import { useNotebookStore } from "@/store/notebook-store";
import { NotebookSources } from "@/components/notebook/notebook-sources";
import { NotebookChat } from "@/components/notebook/notebook-chat";
import { NotebookStudio } from "@/components/notebook/notebook-studio";
import { ArrowLeft, Settings, Share2, Link, X, Users, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NotebookPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = params.id as string;
  const { userId } = useChatStore();
  const { currentNotebook, openNotebook, closeNotebook, shareConfig, memberCount, fetchShareInfo, createShare, revokeShare } = useNotebookStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (userId && notebookId) {
      openNotebook(userId, notebookId);
      fetchShareInfo(userId, notebookId);
    }
    return () => closeNotebook();
  }, [userId, notebookId, openNotebook, closeNotebook, fetchShareInfo]);

  useEffect(() => {
    if (currentNotebook) {
      setTitleValue(currentNotebook.title);
    }
  }, [currentNotebook]);

  const handleTitleSave = async () => {
    if (!titleValue.trim() || !userId || !currentNotebook) return;
    setEditingTitle(false);
    try {
      await fetch(`/api/notebook/${notebookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title: titleValue.trim() }),
      });
    } catch {}
  };

  if (!userId) {
    return (
      <div className="h-screen flex items-center justify-center text-[var(--muted)]">
        请先登录
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      {/* 顶部导航栏 */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--card)]">
        <button
          onClick={() => router.push("/")}
          className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
          title="返回主页"
        >
          <ArrowLeft size={18} />
        </button>

        {currentNotebook && (
          <>
            <span className="text-lg">{currentNotebook.icon}</span>
            {editingTitle ? (
              <input
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
                className="text-sm font-semibold bg-transparent border-b border-blue-400 outline-none px-1"
                autoFocus
              />
            ) : (
              <h1
                className="text-sm font-semibold cursor-pointer hover:text-blue-500 transition-colors"
                onClick={() => setEditingTitle(true)}
                title="点击编辑标题"
              >
                {currentNotebook.title}
              </h1>
            )}

            <div className="flex-1" />

            <div className="relative">
              <button
                onClick={() => setShowSharePanel(!showSharePanel)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors",
                  shareConfig
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
                )}
              >
                <Share2 size={14} />
                {shareConfig ? "已分享" : "分享"}
                {memberCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px]">
                    <Users size={10} /> {memberCount}
                  </span>
                )}
              </button>

              {/* 分享面板 */}
              {showSharePanel && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl p-4 z-50 animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">分享设置</h4>
                    <button onClick={() => setShowSharePanel(false)} className="p-1 rounded hover:bg-[var(--sidebar-hover)]">
                      <X size={14} />
                    </button>
                  </div>

                  {shareConfig ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                        <Link size={14} className="text-green-500 shrink-0" />
                        <input
                          readOnly
                          value={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareConfig.shareId}`}
                          className="flex-1 text-[11px] bg-transparent outline-none truncate"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/share/${shareConfig.shareId}`);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-800 shrink-0"
                        >
                          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        </button>
                      </div>

                      <div className="text-[10px] text-[var(--muted)] space-y-1">
                        <p>访问权限: {shareConfig.access === "public" ? "公开（未登录可看 Studio）" : "需登录查看"}</p>
                        <p>成员数: {memberCount}</p>
                      </div>

                      <button
                        onClick={async () => {
                          if (confirm("确认撤销分享？")) {
                            await revokeShare(userId, notebookId);
                          }
                        }}
                        className="w-full py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 transition-colors"
                      >
                        撤销分享
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-[var(--muted)]">
                        生成分享链接，其他人可以查看 Studio 成果并加入讨论组
                      </p>
                      <button
                        onClick={async () => {
                          await createShare(userId, notebookId, "login-required");
                        }}
                        className="w-full py-2 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 transition-colors"
                      >
                        生成分享链接
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
              title="设置"
            >
              <Settings size={16} />
            </button>
          </>
        )}
      </header>

      {/* 三栏主体 */}
      {currentNotebook ? (
        <div className="flex-1 flex overflow-hidden">
          {/* 左栏：来源 */}
          <div className="w-[280px] shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--card)]">
            <NotebookSources notebookId={notebookId} userId={userId} />
          </div>

          {/* 中栏：AI 对话 / 讨论 */}
          <div className="flex-1 flex flex-col min-w-0">
            <NotebookChat notebookId={notebookId} userId={userId} />
          </div>

          {/* 右栏：Studio */}
          <div className="w-[280px] shrink-0 border-l border-[var(--border)] flex flex-col bg-[var(--card)]">
            <NotebookStudio notebookId={notebookId} userId={userId} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
          加载中...
        </div>
      )}
    </div>
  );
}
