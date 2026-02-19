"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import { useNotebookStore } from "@/store/notebook-store";
import { NotebookSources } from "@/components/notebook/notebook-sources";
import { NotebookChat } from "@/components/notebook/notebook-chat";
import { NotebookStudio } from "@/components/notebook/notebook-studio";
import { ArrowLeft, Settings, Share2 } from "lucide-react";

export default function NotebookPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = params.id as string;
  const { userId } = useChatStore();
  const { currentNotebook, openNotebook, closeNotebook } = useNotebookStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  useEffect(() => {
    if (userId && notebookId) {
      openNotebook(userId, notebookId);
    }
    return () => closeNotebook();
  }, [userId, notebookId, openNotebook, closeNotebook]);

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

            <button
              className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
              title="分享（即将推出）"
            >
              <Share2 size={16} />
            </button>
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
