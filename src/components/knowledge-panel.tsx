"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Search, Trash2, BookOpen, Tag, Globe, MessageSquare, PenLine, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  summary: string;
  source: "deep-research" | "chat" | "manual";
  sourceUrl?: string;
  tags: string[];
  savedAt: string;
}

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  "deep-research": { label: "深度研究", icon: Globe },
  chat: { label: "对话保存", icon: MessageSquare },
  manual: { label: "手动添加", icon: PenLine },
};

export function KnowledgePanel({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ userId });
      if (search) params.set("search", search);
      if (selectedTag) params.set("tag", selectedTag);
      const resp = await fetch(`/api/knowledge?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        setItems(data.items || []);
        setAllTags(data.tags || []);
      }
    } catch {}
    setLoading(false);
  }, [userId, search, selectedTag]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (itemId: string) => {
    try {
      await fetch("/api/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, itemId }),
      });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {}
  };

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: newTitle.trim(),
          content: newContent.trim(),
          source: "manual",
          tags: newTags
            .split(/[,，、\s]+/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (resp.ok) {
        setNewTitle("");
        setNewContent("");
        setNewTags("");
        setShowAddForm(false);
        fetchItems();
      }
    } catch {}
    setSaving(false);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] rounded-2xl w-full max-w-2xl shadow-xl animate-fade-in flex flex-col"
        style={{ height: "min(700px, 85vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-amber-500" />
            <h3 className="text-base font-semibold">我的知识库</h3>
            <span className="text-xs text-[var(--muted)]">
              {items.length} 条知识
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs hover:bg-amber-600 transition-colors"
            >
              + 添加知识
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 手动添加表单 */}
        {showAddForm && (
          <div className="px-5 py-3 border-b border-[var(--border)] space-y-2 animate-fade-in bg-amber-50/50 dark:bg-amber-900/10">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="知识标题"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-sm outline-none focus:border-amber-500"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="知识内容..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-sm outline-none focus:border-amber-500 resize-none"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="标签（逗号分隔）"
                className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-amber-500"
              />
              <button
                onClick={handleAdd}
                disabled={saving || !newTitle.trim() || !newContent.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs hover:bg-amber-600 disabled:bg-gray-300 transition-colors"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}

        {/* 搜索和筛选 */}
        <div className="px-5 py-3 border-b border-[var(--border)] flex gap-2 shrink-0">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索知识库..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-sm outline-none focus:border-amber-500"
            />
          </div>
          {allTags.length > 0 && (
            <div className="relative">
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="appearance-none px-3 pr-7 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="">全部标签</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
              />
            </div>
          )}
        </div>

        {/* 知识列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[var(--muted)]">
              <BookOpen size={36} className="mb-3 opacity-30" />
              <p className="text-sm font-medium mb-2">你的知识库正在等待第一条知识</p>
              <div className="text-xs space-y-1.5 text-center max-w-xs">
                <p>📚 <strong>自动收集</strong>：使用「深度研究」后自动保存</p>
                <p>💬 <strong>对话收藏</strong>：AI 回复下方点击 <span className="inline-flex items-center px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 text-[10px]">📑 加入知识库</span></p>
                <p>🔍 <strong>智能检索</strong>：输入框旁「知识库」按钮随时搜索</p>
              </div>
            </div>
          ) : (
            items.map((item) => {
              const isExpanded = expandedId === item.id;
              const SourceIcon =
                SOURCE_LABELS[item.source]?.icon || MessageSquare;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--border)] overflow-hidden transition-all"
                >
                  {/* 标题行 */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[var(--sidebar-hover)]/50"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : item.id)
                    }
                  >
                    <SourceIcon
                      size={14}
                      className="shrink-0 text-[var(--muted)]"
                    />
                    <span className="text-sm font-medium truncate flex-1">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-[var(--muted)] shrink-0">
                      {formatDate(item.savedAt)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted)] hover:text-red-500 transition-all shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* 摘要（始终可见） */}
                  {!isExpanded && (
                    <div className="px-4 pb-2">
                      <p className="text-xs text-[var(--muted)] line-clamp-2">
                        {item.summary}
                      </p>
                    </div>
                  )}

                  {/* 展开内容 */}
                  {isExpanded && (
                    <div className="px-4 pb-3 animate-fade-in border-t border-[var(--border)]">
                      <div className="py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                        {item.content}
                      </div>
                      {/* 标签和来源 */}
                      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[var(--border)]">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[var(--muted)]">
                          {SOURCE_LABELS[item.source]?.label || item.source}
                        </span>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-500 hover:underline truncate max-w-[200px]"
                          >
                            {item.sourceUrl}
                          </a>
                        )}
                        {item.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 cursor-pointer hover:bg-amber-200"
                            onClick={() => {
                              setSelectedTag(tag);
                              setExpandedId(null);
                            }}
                          >
                            <Tag size={8} className="inline mr-0.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
