"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore, MODE_CONFIGS, GenerationMode } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import {
  Menu,
  SquarePen,
  MessageSquare,
  Trash2,
  Moon,
  Sun,
  ChevronRight,
  Plus,
  X,
  Gem,
  Key,
  Headphones,
  Send,
  Gift,
  Zap,
} from "lucide-react";

interface ContactMsg {
  id: string;
  from: "user" | "admin";
  content: string;
  timestamp: string;
}

function ContactChatDialog({
  userId,
  contactMsg,
  setContactMsg,
  contactSending,
  onSend,
  onClose,
  contactQrUrl,
  contactWechatId,
}: {
  userId: string;
  contactMsg: string;
  setContactMsg: (v: string) => void;
  contactSending: boolean;
  onSend: () => void;
  onClose: () => void;
  contactQrUrl?: string;
  contactWechatId?: string;
}) {
  const [messages, setMessages] = useState<ContactMsg[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const resp = await fetch(`/api/contact?userId=${encodeURIComponent(userId)}`);
      if (resp.ok) {
        const data = await resp.json();
        setMessages(data.messages || []);
      }
    } catch {}
  }, [userId]);

  useEffect(() => {
    fetchMessages();
    const timer = setInterval(fetchMessages, 3000);
    return () => clearInterval(timer);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    onSend();
    setTimeout(fetchMessages, 500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl w-full max-w-lg shadow-xl animate-fade-in flex flex-col"
        style={{ height: "min(600px, 85vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div>
            <h3 className="text-base font-semibold">联系客服</h3>
            <p className="text-[10px] text-[var(--muted)]">消息会实时送达，客服将尽快回复</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {/* 微信联系方式提示 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-4">
              <img
                src={contactQrUrl || "/wechat-qr.png"}
                alt="客服微信二维码"
                className="flex-shrink-0 w-24 h-24 rounded-lg object-contain"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  客服微信
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-1">
                  微信号：{contactWechatId || "jryg8686"}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  扫码或搜索微信号添加客服
                </p>
              </div>
            </div>
          </div>

          {messages.length === 0 && (
            <p className="text-center text-sm text-[var(--muted)] py-8">
              有问题随时发消息，客服会尽快回复您
            </p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.from === "admin" ? "justify-start" : "justify-end"}`}>
              <div
                className={cn(
                  "max-w-[75%] px-3 py-2 rounded-2xl text-sm",
                  msg.from === "admin"
                    ? "bg-[var(--sidebar-hover)] text-[var(--foreground)]"
                    : "bg-blue-500 text-white"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={cn(
                  "text-[10px] mt-1",
                  msg.from === "admin" ? "text-[var(--muted)]" : "text-blue-100"
                )}>
                  {new Date(msg.timestamp).toLocaleString("zh-CN")}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
          <div className="flex gap-2">
            <input
              value={contactMsg}
              onChange={(e) => setContactMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="输入消息..."
              className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={!contactMsg.trim() || contactSending}
              className={cn(
                "p-2.5 rounded-xl text-white transition-colors",
                contactMsg.trim() && !contactSending
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "bg-gray-300 cursor-not-allowed"
              )}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    activeMode,
    setActiveMode,
    userApiKey,
    setUserApiKey,
    userId,
  } = useChatStore();

  const [showGems, setShowGems] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactStatus, setContactStatus] = useState<"" | "success" | "error">(""  );
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenCountRef = useRef(0);
  const [sidebarKeyInput, setSidebarKeyInput] = useState("");
  const [sidebarKeyMsg, setSidebarKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showNewGem, setShowNewGem] = useState(false);
  const [siteConfig, setSiteConfig] = useState<{ contactQrUrl?: string; contactWechatId?: string } | null>(null);

  useEffect(() => {
    fetch("/api/site-config").then(r => r.json()).then(d => setSiteConfig(d.config)).catch(() => {});
  }, []);
  const [newGemName, setNewGemName] = useState("");
  const [newGemIcon, setNewGemIcon] = useState("🤖");
  const [newGemDesc, setNewGemDesc] = useState("");
  const [newGemPrompt, setNewGemPrompt] = useState("");

  const handleSidebarKeySubmit = async () => {
    const val = sidebarKeyInput.trim();
    if (!val) return;
    if (/^OS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(val)) {
      setSidebarKeyMsg({ ok: true, text: "验证中..." });
      try {
        const r = await fetch("/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, code: val }),
        });
        const data = await r.json();
        if (r.ok && data.success) {
          setSidebarKeyMsg({ ok: true, text: data.message });
          setSidebarKeyInput("");
          setUserApiKey("");
        } else {
          setSidebarKeyMsg({ ok: false, text: data.error || "兑换失败" });
        }
      } catch {
        setSidebarKeyMsg({ ok: false, text: "网络错误" });
      }
    } else {
      setUserApiKey(val);
      setSidebarKeyInput("");
      setSidebarKeyMsg({ ok: true, text: "API Key 已保存" });
    }
    setTimeout(() => setSidebarKeyMsg(null), 4000);
  };

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

  // 轮询未读消息
  const checkUnread = useCallback(async () => {
    if (!userId || showContact) return;
    try {
      const resp = await fetch(`/api/contact?userId=${encodeURIComponent(userId)}`);
      if (resp.ok) {
        const data = await resp.json();
        const adminMsgCount = (data.messages || []).filter((m: { from: string }) => m.from === "admin").length;
        const newUnread = adminMsgCount - lastSeenCountRef.current;
        setUnreadCount(newUnread > 0 ? newUnread : 0);
      }
    } catch {}
  }, [userId, showContact]);

  useEffect(() => {
    checkUnread();
    const timer = setInterval(checkUnread, 5000);
    return () => clearInterval(timer);
  }, [checkUnread]);

  // 打开客服窗口时清除红点
  const handleOpenContact = () => {
    setShowContact(true);
    setUnreadCount(0);
    // 记录当前已看到的管理员消息数
    fetch(`/api/contact?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => {
        const adminMsgCount = (data.messages || []).filter((m: { from: string }) => m.from === "admin").length;
        lastSeenCountRef.current = adminMsgCount;
      })
      .catch(() => {});
  };

  const handleSendContact = async () => {
    if (!contactMsg.trim() || contactSending) return;
    setContactSending(true);
    setContactStatus("");
    try {
      const resp = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: contactMsg.trim() }),
      });
      if (resp.ok) {
        setContactStatus("success");
        setContactMsg("");
      } else {
        setContactStatus("error");
      }
    } catch {
      setContactStatus("error");
    } finally {
      setContactSending(false);
    }
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
                className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm text-blue-500"
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
          {/* Mode selector */}
          <div className="px-1 pb-1">
            <div className="text-[10px] font-medium text-[var(--muted)] px-2 mb-1">AI 模式</div>
            <div className="grid grid-cols-1 gap-0.5">
              {(Object.keys(MODE_CONFIGS) as GenerationMode[]).map((mode) => {
                const m = MODE_CONFIGS[mode];
                const isActive = activeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setActiveMode(mode)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors",
                      isActive
                        ? "bg-blue-500/10 text-blue-500 font-medium"
                        : "text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
                    )}
                  >
                    <span className="text-sm">{m.icon}</span>
                    <span>{m.label}</span>
                    <span className="ml-auto text-[10px] text-[var(--muted)]">{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span>{darkMode ? "浅色模式" : "深色模式"}</span>
          </button>

          {/* API Key / 兑换码 */}
          <button
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm",
              userApiKey ? "text-green-600 dark:text-green-400" : "text-[var(--foreground)]"
            )}
          >
            <Key size={18} />
            <span>Key / 兑换码</span>
            {userApiKey && (
              <span className="ml-auto text-[10px] text-green-600 dark:text-green-400">已配置</span>
            )}
          </button>
          {showApiKeyInput && (
            <div className="px-2 pb-2 animate-fade-in space-y-1.5">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={sidebarKeyInput}
                  onChange={(e) => setSidebarKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSidebarKeySubmit()}
                  placeholder="API Key 或兑换码 (OS-XXXX-XXXX)"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSidebarKeySubmit}
                  disabled={!sidebarKeyInput.trim()}
                  className={cn(
                    "px-2 py-1.5 rounded-lg text-white text-[10px] shrink-0",
                    sidebarKeyInput.trim()
                      ? /^OS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(sidebarKeyInput.trim()) ? "bg-amber-500" : "bg-blue-500"
                      : "bg-gray-300"
                  )}
                >
                  {/^OS-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(sidebarKeyInput.trim()) ? "兑换" : "保存"}
                </button>
              </div>
              {sidebarKeyMsg && (
                <p className={cn("text-[10px]", sidebarKeyMsg.ok ? "text-green-600" : "text-red-500")}>{sidebarKeyMsg.text}</p>
              )}
              {userApiKey && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-green-600 dark:text-green-400">Key: •••{userApiKey.slice(-6)}</span>
                  <button onClick={() => setUserApiKey("")} className="text-red-500">清除</button>
                </div>
              )}
            </div>
          )}

          {/* 联系客服 */}
          <button
            onClick={handleOpenContact}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-sm relative"
          >
            <Headphones size={18} />
            <span>联系客服</span>
            {unreadCount > 0 && (
              <span className="absolute right-3 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
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
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
                  placeholder="专家名称"
                />
              </div>
              <input
                type="text"
                value={newGemDesc}
                onChange={(e) => setNewGemDesc(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
                placeholder="简短描述（可选）"
              />
              <textarea
                value={newGemPrompt}
                onChange={(e) => setNewGemPrompt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500 resize-none"
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
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-300 cursor-not-allowed"
                )}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 联系客服聊天窗口 */}
      {showContact && (
        <ContactChatDialog
          userId={userId}
          contactMsg={contactMsg}
          setContactMsg={setContactMsg}
          contactSending={contactSending}
          onSend={handleSendContact}
          onClose={() => setShowContact(false)}
          contactQrUrl={siteConfig?.contactQrUrl}
          contactWechatId={siteConfig?.contactWechatId}
        />
      )}
    </>
  );
}
