"use client";

import { useState, useEffect, useRef } from "react";
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

// 兴趣 → 模板知识库
interface NotebookTemplate {
  icon: string;
  title: string;
  description: string;
}

const INTEREST_TEMPLATES: Record<string, NotebookTemplate[]> = {
  "编程开发": [
    { icon: "💻", title: "编程学习笔记", description: "代码片段、技术文章、学习心得" },
    { icon: "🔧", title: "项目开发文档", description: "需求分析、架构设计、开发日志" },
  ],
  "金融投资": [
    { icon: "📈", title: "投资研究", description: "市场分析、个股研究、投资策略" },
    { icon: "💰", title: "理财规划", description: "资产配置、财务目标、消费记录" },
  ],
  "医学健康": [
    { icon: "🩺", title: "健康管理", description: "体检记录、用药记录、健康知识" },
    { icon: "🥗", title: "营养饮食", description: "食谱收藏、营养知识、饮食计划" },
  ],
  "法律咨询": [
    { icon: "⚖️", title: "法律知识库", description: "法条收藏、案例分析、合同模板" },
  ],
  "教育学习": [
    { icon: "📚", title: "学习资料库", description: "课程笔记、考试重点、学习计划" },
    { icon: "📝", title: "论文写作", description: "参考文献、写作素材、研究进展" },
  ],
  "设计创意": [
    { icon: "🎨", title: "设计灵感库", description: "配色方案、设计素材、灵感收藏" },
  ],
  "商业创业": [
    { icon: "🚀", title: "创业笔记", description: "商业计划、竞品分析、市场调研" },
    { icon: "💼", title: "商业案例", description: "成功案例、行业报告、商业模式" },
  ],
  "科学研究": [
    { icon: "🔬", title: "科研文献库", description: "论文摘要、实验数据、研究笔记" },
  ],
  "语言学习": [
    { icon: "🗣️", title: "外语学习", description: "词汇积累、语法笔记、听力材料" },
  ],
  "心理成长": [
    { icon: "🧠", title: "自我成长", description: "心理学知识、情绪日记、成长记录" },
  ],
  "生活达人": [
    { icon: "🏠", title: "生活百科", description: "生活技巧、旅行攻略、美食菜谱" },
  ],
  "自媒体": [
    { icon: "�", title: "内容素材库", description: "选题灵感、爆款案例、运营技巧" },
    { icon: "🎬", title: "视频创作", description: "脚本模板、剪辑技巧、拍摄方案" },
  ],
};

// 通用模板（所有用户都有）
const COMMON_TEMPLATES: NotebookTemplate[] = [
  { icon: "�", title: "深度研究", description: "搜索和深度研究的收藏内容" },
  { icon: "📓", title: "AI 对话精选", description: "收藏有价值的 AI 对话内容" },
];

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
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<NotebookTemplate[]>([]);
  const seedingRef = useRef(false);

  useEffect(() => {
    if (userId) fetchNotebooks(userId);
  }, [userId, fetchNotebooks]);

  // 加载用户兴趣，生成模板列表
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/profile?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => {
        const interests: string[] = data.profile?.interests || [];
        const tpls: NotebookTemplate[] = [];
        for (const interest of interests) {
          const mapped = INTEREST_TEMPLATES[interest];
          if (mapped) tpls.push(...mapped);
        }
        tpls.push(...COMMON_TEMPLATES);
        const seen = new Set<string>();
        setTemplates(
          tpls.filter((t) => {
            if (seen.has(t.title)) return false;
            seen.add(t.title);
            return true;
          }).slice(0, 8)
        );
      })
      .catch(() => {});
  }, [userId]);

  // 自动创建模板知识库（基于兴趣，缺哪个创哪个）
  useEffect(() => {
    if (loadingList || seedingRef.current || templates.length === 0) return;

    const existingTitles = new Set(notebooks.map((nb) => nb.title));
    const toCreate = templates.filter((t) => !existingTitles.has(t.title));

    // 所有模板已存在，无需创建
    if (toCreate.length === 0) return;

    seedingRef.current = true;
    Promise.all(toCreate.map((tpl) => createNotebook(userId, tpl.title, tpl.icon)))
      .catch(() => {});
  }, [loadingList, templates, notebooks, userId, createNotebook]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const nb = await createNotebook(userId, newTitle.trim(), "📓");
    if (nb) {
      setNewTitle("");
      setShowCreate(false);
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

        {/* 新建表单（无图标选择，默认📓） */}
        {showCreate && (
          <div className="px-5 py-3 border-b border-[var(--border)] bg-blue-50/30 dark:bg-blue-900/10 animate-fade-in">
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
              <p className="text-sm font-medium mb-1">正在为你准备知识库...</p>
              <p className="text-xs">根据你的兴趣自动创建中</p>
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
