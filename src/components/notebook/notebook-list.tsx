"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotebookStore, Notebook } from "@/store/notebook-store";
import {
  X,
  Plus,
  BookOpen,
  Trash2,
  Clock,
  FileText,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NOTEBOOK_ICONS = ["📓", "📚", "🔬", "💡", "🎯", "📊", "🧠", "🌍", "💻", "🎨", "📝", "🔍"];

export function NotebookList({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { notebooks, loadingList, fetchNotebooks, createNotebook, deleteNotebook } =
    useNotebookStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIcon, setNewIcon] = useState("📓");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (userId) fetchNotebooks(userId);
  }, [userId, fetchNotebooks]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const nb = await createNotebook(userId, newTitle.trim(), newIcon);
    if (nb) {
      setNewTitle("");
      setNewIcon("📓");
      setShowCreate(false);
      // 创建后直接打开
      onClose();
      router.push(`/notebook/${nb.id}`);
    }
    setCreating(false);
  };

  const handleOpen = (nb: Notebook) => {
    onClose();
    router.push(`/notebook/${nb.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, nbId: string) => {
    e.stopPropagation();
    if (!confirm("确认删除此知识库？所有来源和对话将被清除。")) return;
    await deleteNotebook(userId, nbId);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] rounded-2xl w-full max-w-lg shadow-xl animate-fade-in flex flex-col"
        style={{ height: "min(600px, 80vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-blue-500" />
            <h3 className="text-base font-semibold">我的知识库</h3>
            <span className="text-xs text-[var(--muted)]">{notebooks.length} 个</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 transition-colors"
            >
              <Plus size={14} />
              新建
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 新建表单 */}
        {showCreate && (
          <div className="px-5 py-3 border-b border-[var(--border)] bg-blue-50/30 dark:bg-blue-900/10 animate-fade-in">
            <div className="flex gap-2 mb-2">
              {NOTEBOOK_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewIcon(icon)}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all",
                    newIcon === icon
                      ? "bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400"
                      : "hover:bg-[var(--sidebar-hover)]"
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="知识库名称..."
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
              >
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        )}

        {/* 知识库列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
              加载中...
            </div>
          ) : notebooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
              <BookOpen size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-medium mb-1">还没有知识库</p>
              <p className="text-xs">点击「新建」创建你的第一个知识库</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notebooks.map((nb) => (
                <div
                  key={nb.id}
                  onClick={() => handleOpen(nb)}
                  className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 cursor-pointer transition-all"
                >
                  <span className="text-2xl">{nb.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{nb.title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                        <FileText size={10} />
                        {nb.sourceCount} 个来源
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                        <Clock size={10} />
                        {formatDate(nb.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, nb.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted)] hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={16} className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
