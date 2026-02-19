"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useNotebookStore, DiscussMessage } from "@/store/notebook-store";
import { Bot, Send, User, MessageSquareMore, Loader2, Image as ImageIcon, BookmarkPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

export function NotebookChat({
  notebookId,
  userId,
}: {
  notebookId: string;
  userId: string;
}) {
  const {
    chatMessages,
    loadingChat,
    streamingResponse,
    sendMessage,
    middleTab,
    setMiddleTab,
    sources,
  } = useNotebookStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, streamingResponse]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || loadingChat) return;
    setInput("");
    sendMessage(userId, notebookId, msg);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const enabledSources = sources.filter((s) => s.enabled);

  return (
    <div className="flex flex-col h-full">
      {/* 标签切换 */}
      <div className="flex items-center border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => setMiddleTab("ai")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2",
            middleTab === "ai"
              ? "text-blue-500 border-blue-500"
              : "text-[var(--muted)] border-transparent hover:text-[var(--fg)]"
          )}
        >
          <Bot size={14} />
          AI 分析
        </button>
        <button
          onClick={() => setMiddleTab("discuss")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2",
            middleTab === "discuss"
              ? "text-blue-500 border-blue-500"
              : "text-[var(--muted)] border-transparent hover:text-[var(--fg)]"
          )}
        >
          <MessageSquareMore size={14} />
          讨论组
        </button>
      </div>

      {middleTab === "ai" ? (
        <>
          {/* AI 对话区 */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {chatMessages.length === 0 && !streamingResponse ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--muted)]">
                <Bot size={36} className="mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">基于来源的 AI 分析</p>
                <p className="text-xs text-center max-w-xs">
                  {enabledSources.length > 0
                    ? `已加载 ${enabledSources.length} 个来源，可以开始提问`
                    : "请先在左侧添加来源资料"}
                </p>
                {enabledSources.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {["总结这些资料的核心要点", "这些资料有哪些共同主题？", "基于这些资料，有哪些值得关注的发现？"].map(
                      (q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setInput(q);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="block w-full text-left px-3 py-2 rounded-lg border border-[var(--border)] text-xs hover:bg-[var(--sidebar-hover)] transition-colors"
                        >
                          {q}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "")}>
                    {msg.role === "model" && (
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot size={14} className="text-blue-500" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                        msg.role === "user"
                          ? "bg-blue-500 text-white rounded-br-md"
                          : "bg-[var(--sidebar-hover)] rounded-bl-md"
                      )}
                    >
                      {msg.role === "model" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                        <User size={14} />
                      </div>
                    )}
                  </div>
                ))}

                {/* 流式响应 */}
                {streamingResponse && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-blue-500" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-[var(--sidebar-hover)] px-3.5 py-2.5 text-sm">
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>{streamingResponse}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {loadingChat && !streamingResponse && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Loader2 size={14} className="text-blue-500 animate-spin" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-[var(--sidebar-hover)] px-3.5 py-2.5 text-sm text-[var(--muted)]">
                      思考中...
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 输入框 */}
          <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  enabledSources.length > 0
                    ? `基于 ${enabledSources.length} 个来源提问...`
                    : "请先添加来源资料..."
                }
                rows={1}
                className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-400 resize-none max-h-[120px]"
              />
              <button
                onClick={handleSend}
                disabled={loadingChat || !input.trim()}
                className="p-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-colors shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-1.5 text-center">
              {enabledSources.length} 个来源已加载 · AI 回答基于来源内容
            </p>
          </div>
        </>
      ) : (
        <DiscussPanel notebookId={notebookId} userId={userId} />
      )}
    </div>
  );
}

// ========== 讨论组面板 ==========
function DiscussPanel({ notebookId, userId }: { notebookId: string; userId: string }) {
  const {
    discussMessages,
    loadingDiscuss,
    fetchDiscussMessages,
    sendDiscussMessage,
  } = useNotebookStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 初始加载 + 轮询
  useEffect(() => {
    fetchDiscussMessages(userId, notebookId);
    pollRef.current = setInterval(() => {
      fetchDiscussMessages(userId, notebookId);
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [userId, notebookId, fetchDiscussMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [discussMessages]);

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    sendDiscussMessage(userId, notebookId, "text", msg);
  }, [input, userId, notebookId, sendDiscussMessage]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      alert("图片不能超过 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      sendDiscussMessage(userId, notebookId, "image", base64);
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }, [userId, notebookId, sendDiscussMessage]);

  const handleSaveToKb = useCallback(async (msg: DiscussMessage) => {
    try {
      await fetch(`/api/notebook/${notebookId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          type: "text",
          title: `讨论: ${msg.userName} - ${msg.content.slice(0, 30)}...`,
          content: msg.content,
          metadata: { wordCount: msg.content.length },
        }),
      });
      alert("已添加到来源");
    } catch {
      alert("保存失败");
    }
  }, [userId, notebookId]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 讨论消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadingDiscuss && discussMessages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[var(--muted)] text-xs">
            加载中...
          </div>
        ) : discussMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted)]">
            <MessageSquareMore size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">讨论组</p>
            <p className="text-xs text-center">
              分享知识库后，成员可在此讨论交流
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {discussMessages.map((msg) => {
              const isMe = msg.userId === userId;
              return (
                <div key={msg.id} className={cn("flex gap-2", isMe ? "justify-end" : "")}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                      {msg.userName?.charAt(0) || "?"}
                    </div>
                  )}
                  <div className={cn("max-w-[75%]", isMe ? "text-right" : "")}>
                    {!isMe && (
                      <p className="text-[10px] text-[var(--muted)] mb-0.5">{msg.userName}</p>
                    )}
                    {msg.type === "image" ? (
                      <img
                        src={msg.content}
                        alt="图片"
                        className="max-w-[200px] max-h-[200px] rounded-lg border border-[var(--border)] cursor-pointer"
                        onClick={() => window.open(msg.content, "_blank")}
                      />
                    ) : (
                      <div
                        className={cn(
                          "inline-block rounded-2xl px-3 py-2 text-sm",
                          isMe
                            ? "bg-blue-500 text-white rounded-br-md"
                            : "bg-[var(--sidebar-hover)] rounded-bl-md"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-[var(--muted)]">{formatTime(msg.timestamp)}</span>
                      {msg.type === "text" && !isMe && (
                        <button
                          onClick={() => handleSaveToKb(msg)}
                          className="text-[9px] text-[var(--muted)] hover:text-amber-500 flex items-center gap-0.5"
                          title="加入来源"
                        >
                          <BookmarkPlus size={9} /> 加入来源
                        </button>
                      )}
                    </div>
                  </div>
                  {isMe && (
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                      <User size={14} />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 讨论输入框 */}
      <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
        <div className="flex items-end gap-2">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors shrink-0"
            title="发送图片"
          >
            <ImageIcon size={16} />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="发送消息..."
            rows={1}
            className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-400 resize-none max-h-[120px]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
