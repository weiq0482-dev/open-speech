"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import {
  Menu,
  SquarePen,
  MessageSquare,
  Trash2,
  Settings,
  Moon,
  Sun,
  ChevronRight,
  Plus,
  X,
  Gem,
} from "lucide-react";

export function Sidebar() {
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    darkMode,
    toggleSidebar,
    toggleDarkMode,
    createConversation,
    setActiveConversation,
    deleteConversation,
    gems,
    addGem,
    deleteGem,
    activeGemId,
  } = useChatStore();

  const [showGems, setShowGems] = useState(false);
  const [showNewGem, setShowNewGem] = useState(false);
  const [newGemName, setNewGemName] = useState("");
  const [newGemIcon, setNewGemIcon] = useState("🤖");
  const [newGemDesc, setNewGemDesc] = useState("");
  const [newGemPrompt, setNewGemPrompt] = useState("");

  const handleCreateGem = () => {
    if (!newGemName.trim() || !newGemPrompt.trim()) return;
    addGem({
      name: newGemName.trim(),
      icon: newGemIcon,
      description: newGemDesc.trim() || newGemName.trim(),
      systemPrompt: newGemPrompt.trim(),
    });
    setNewGemName("");
    setNewGemIcon("🤖");
    setNewGemDesc("");
    setNewGemPrompt("");
    setShowNewGem(false);
  };

  const handleGemClick = (gemId: string) => {
    createConversation(gemId);
    // 移动端自动收起侧边栏
    if (window.innerWidth < 1024) toggleSidebar();
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "sidebar-transition fixed lg:relative z-40 h-full flex flex-col",
          "bg-[var(--sidebar-bg)] border-r border-[var(--border)]",
          sidebarOpen ? "w-[280px]" : "w-0 lg:w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-3 h-14">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] transition-colors"
            title="收起侧边栏"
          >
            <Menu size={20} />
          </button>
          <button
            onClick={() => createConversation()}
            className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] transition-colors ml-auto"
            title="新对话"
          >
            <SquarePen size={20} />
          </button>
        </div>

        {/* Gem section */}
        <div className="px-2">
          <button
            onClick={() => setShowGems(!showGems)}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm"
          >
            <Gem size={18} className="text-purple-500" />
            <span className="font-medium">专家库</span>
            <ChevronRight
              size={14}
              className={cn(
                "ml-auto text-[var(--muted)] transition-transform",
                showGems && "rotate-90"
              )}
            />
          </button>

          {showGems && (
            <div className="ml-2 mt-1 space-y-0.5 animate-fade-in">
              {gems.map((gem) => (
                <div
                  key={gem.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors text-sm",
                    activeGemId === gem.id
                      ? "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                      : "hover:bg-[var(--sidebar-hover)]/60"
                  )}
                  onClick={() => handleGemClick(gem.id)}
                  title={gem.description}
                >
                  <span className="text-base">{gem.icon}</span>
                  <span className="truncate flex-1">{gem.name}</span>
                  {!gem.isBuiltin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteGem(gem.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted)] hover:text-red-500 transition-all"
                      title="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}

              {/* New Gem button */}
              <button
                onClick={() => setShowNewGem(true)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm text-gemini-blue"
              >
                <Plus size={16} />
                <span>找专家</span>
              </button>
            </div>
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 mt-1">
          <div className="text-xs font-medium text-[var(--muted)] px-3 py-2">
            对话历史
          </div>
          {conversations.length === 0 ? (
            <div className="text-sm text-[var(--muted)] text-center py-8">
              暂无对话
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => {
                const convGem = conv.gemId ? gems.find((g) => g.id === conv.gemId) : undefined;
                return (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors text-sm",
                      conv.id === activeConversationId
                        ? "bg-[var(--sidebar-hover)] font-medium"
                        : "hover:bg-[var(--sidebar-hover)]/60"
                    )}
                    onClick={() => {
                      setActiveConversation(conv.id);
                      if (window.innerWidth < 1024) toggleSidebar();
                    }}
                  >
                    {convGem ? (
                      <span className="shrink-0 text-sm">{convGem.icon}</span>
                    ) : (
                      <MessageSquare size={16} className="shrink-0 text-[var(--muted)]" />
                    )}
                    <span className="truncate flex-1">{conv.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted)] hover:text-red-500 transition-all"
                      title="删除对话"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border)] space-y-1">
          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span>{darkMode ? "浅色模式" : "深色模式"}</span>
          </button>
          <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm">
            <Settings size={18} />
            <span>设置</span>
          </button>
        </div>
      </aside>

      {/* New Gem Modal */}
      {showNewGem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card)] rounded-2xl w-full max-w-md shadow-xl animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="text-lg font-semibold">找专家</h3>
              <button
                onClick={() => setShowNewGem(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newGemIcon}
                  onChange={(e) => setNewGemIcon(e.target.value)}
                  className="w-12 h-12 text-center text-2xl rounded-xl border border-[var(--border)] bg-transparent"
                  maxLength={2}
                  placeholder="🤖"
                />
                <input
                  type="text"
                  value={newGemName}
                  onChange={(e) => setNewGemName(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-gemini-blue"
                  placeholder="专家名称"
                />
              </div>
              <input
                type="text"
                value={newGemDesc}
                onChange={(e) => setNewGemDesc(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-gemini-blue"
                placeholder="简短描述（可选）"
              />
              <textarea
                value={newGemPrompt}
                onChange={(e) => setNewGemPrompt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-gemini-blue resize-none"
                rows={5}
                placeholder="系统指令：告诉 AI 它应该如何表现、擅长什么、回答风格等..."
              />
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--border)]">
              <button
                onClick={() => setShowNewGem(false)}
                className="px-4 py-2 rounded-xl text-sm hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateGem}
                disabled={!newGemName.trim() || !newGemPrompt.trim()}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm text-white transition-colors",
                  newGemName.trim() && newGemPrompt.trim()
                    ? "bg-gemini-blue hover:bg-blue-600"
                    : "bg-gray-300 cursor-not-allowed"
                )}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
