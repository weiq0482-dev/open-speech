"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Message {
  id: string;
  from: "user" | "admin";
  content: string;
  timestamp: string;
}

function ReplyContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("u") || "";
  const adminKey = searchParams.get("k") || "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!userId) return;
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

  const handleReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    setSent(false);
    try {
      const resp = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message: replyText.trim(),
          adminKey,
          action: "reply",
        }),
      });
      if (resp.ok) {
        setReplyText("");
        setSent(true);
        fetchMessages();
        setTimeout(() => setSent(false), 2000);
      }
    } catch {}
    setSending(false);
  };

  if (!userId || !adminKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-500">链接无效</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ maxHeight: "100dvh" }}>
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 shrink-0 safe-area-top">
        <h1 className="text-base font-semibold text-gray-900">
          回复用户 {userId.slice(0, 8)}...
        </h1>
        <p className="text-xs text-gray-500">{messages.length} 条消息</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.from === "admin" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm ${
                msg.from === "admin"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-900 shadow-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p
                className={`text-[10px] mt-1 ${
                  msg.from === "admin" ? "text-blue-100" : "text-gray-400"
                }`}
              >
                {msg.from === "admin" ? "客服" : "用户"} · {new Date(msg.timestamp).toLocaleString("zh-CN")}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-3 shrink-0 safe-area-bottom">
        {sent && (
          <p className="text-xs text-green-500 text-center mb-2">✓ 已发送</p>
        )}
        <div className="flex gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReply()}
            placeholder="输入回复..."
            className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-sm outline-none focus:border-blue-500 bg-gray-50"
            autoFocus
          />
          <button
            onClick={handleReply}
            disabled={!replyText.trim() || sending}
            className={`px-5 py-2.5 rounded-full text-sm text-white font-medium transition-colors ${
              replyText.trim() && !sending
                ? "bg-blue-500 active:bg-blue-600"
                : "bg-gray-300"
            }`}
          >
            {sending ? "..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReplyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">加载中...</p></div>}>
      <ReplyContent />
    </Suspense>
  );
}
