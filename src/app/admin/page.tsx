"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: string;
  from: "user" | "admin";
  content: string;
  timestamp: string;
  read?: boolean;
}

interface Thread {
  userId: string;
  messages: Message[];
  lastActivity: string;
}

const ADMIN_KEY = "openspeech-admin-2026";

export default function AdminPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [storedKey, setStoredKey] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 读取管理密钥
  useEffect(() => {
    const saved = localStorage.getItem("openspeech-admin-key");
    if (saved) {
      setStoredKey(saved);
      setAuthed(true);
    }
  }, []);

  // 拉取所有对话
  const fetchThreads = useCallback(async () => {
    if (!authed) return;
    try {
      const key = storedKey || keyInput;
      const resp = await fetch(`/api/contact?admin=1&key=${encodeURIComponent(key)}`);
      if (resp.ok) {
        const data = await resp.json();
        setThreads(data.threads || []);
      }
    } catch {}
  }, [authed, storedKey, keyInput]);

  // 轮询
  useEffect(() => {
    fetchThreads();
    const timer = setInterval(fetchThreads, 3000);
    return () => clearInterval(timer);
  }, [fetchThreads]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeUserId, threads]);

  const handleLogin = () => {
    localStorage.setItem("openspeech-admin-key", keyInput);
    setStoredKey(keyInput);
    setAuthed(true);
  };

  const handleReply = async () => {
    if (!replyText.trim() || !activeUserId || sending) return;
    setSending(true);
    try {
      const resp = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeUserId,
          message: replyText.trim(),
          adminKey: storedKey,
          action: "reply",
        }),
      });
      if (resp.ok) {
        setReplyText("");
        fetchThreads();
      }
    } catch {}
    setSending(false);
  };

  const activeThread = threads.find((t) => t.userId === activeUserId);
  const unreadCounts = threads.reduce<Record<string, number>>((acc, t) => {
    acc[t.userId] = t.messages.filter((m) => m.from === "user" && !m.read).length;
    return acc;
  }, {});

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-sm w-full">
          <h1 className="text-xl font-bold mb-4 text-center">OpenSpeech 管理后台</h1>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="输入管理密钥"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-blue-500 mb-4"
          />
          <button
            onClick={handleLogin}
            className="w-full px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            进入管理
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* 左侧：用户列表 */}
      <div className="w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold">客服消息</h1>
          <p className="text-xs text-gray-500 mt-1">{threads.length} 个用户会话</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.map((thread) => {
            const lastMsg = thread.messages[thread.messages.length - 1];
            const unread = unreadCounts[thread.userId] || 0;
            return (
              <button
                key={thread.userId}
                onClick={() => setActiveUserId(thread.userId)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  activeUserId === thread.userId ? "bg-blue-50 dark:bg-blue-900/30" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">
                    {thread.userId.slice(0, 8)}...
                  </span>
                  {unread > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {unread}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {lastMsg ? lastMsg.content : "暂无消息"}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {lastMsg ? new Date(lastMsg.timestamp).toLocaleString("zh-CN") : ""}
                </p>
              </button>
            );
          })}
          {threads.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">暂无用户消息</p>
          )}
        </div>
      </div>

      {/* 右侧：对话详情 */}
      <div className="flex-1 flex flex-col">
        {activeThread ? (
          <>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-sm font-semibold">用户 {activeUserId?.slice(0, 8)}...</h2>
              <p className="text-xs text-gray-500">
                共 {activeThread.messages.length} 条消息 · 最后活跃 {new Date(activeThread.lastActivity).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {activeThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.from === "admin" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                      msg.from === "admin"
                        ? "bg-blue-500 text-white"
                        : "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-[10px] mt-1 ${
                        msg.from === "admin" ? "text-blue-100" : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReply()}
                  placeholder="输入回复内容..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || sending}
                  className={`px-6 py-2.5 rounded-xl text-sm text-white transition-colors ${
                    replyText.trim() && !sending
                      ? "bg-blue-500 hover:bg-blue-600"
                      : "bg-gray-300 cursor-not-allowed"
                  }`}
                >
                  {sending ? "发送中..." : "发送"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>← 选择一个用户会话开始回复</p>
          </div>
        )}
      </div>
    </div>
  );
}
