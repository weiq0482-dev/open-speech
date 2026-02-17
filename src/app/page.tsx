"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useChatStore, type Attachment } from "@/store/chat-store";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage } from "@/components/chat-message";
import { Menu, SquarePen, Sparkles, Headphones, Send, X } from "lucide-react";

function ContactMiniChat({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<{ id: string; from: string; content: string; timestamp: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchMsgs = useCallback(async () => {
    try {
      const r = await fetch(`/api/contact?userId=${encodeURIComponent(userId)}`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); }
    } catch {}
  }, [userId]);

  useEffect(() => { fetchMsgs(); const t = setInterval(fetchMsgs, 3000); return () => clearInterval(t); }, [fetchMsgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: input.trim() }),
      });
      setInput("");
      setTimeout(fetchMsgs, 300);
    } catch {}
    setSending(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 shadow-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)] flex flex-col animate-fade-in"
      style={{ height: "420px" }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <Headphones size={16} className="text-blue-500" />
          <span className="text-sm font-semibold">客服消息</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && <p className="text-center text-xs text-[var(--muted)] py-6">暂无消息</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.from === "admin" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-xs ${
              msg.from === "admin"
                ? "bg-[var(--sidebar-hover)] text-[var(--foreground)]"
                : "bg-blue-500 text-white"
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={`text-[9px] mt-0.5 ${msg.from === "admin" ? "text-[var(--muted)]" : "text-blue-100"}`}>
                {new Date(msg.timestamp).toLocaleTimeString("zh-CN")}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="px-3 py-2 border-t border-[var(--border)] shrink-0">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入消息..."
            className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className={`p-1.5 rounded-lg text-white transition-colors ${
              input.trim() && !sending ? "bg-blue-500" : "bg-gray-300"
            }`}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const {
    activeConversationId,
    sidebarOpen,
    toggleSidebar,
    createConversation,
    addMessage,
    updateMessage,
    setMessageStreaming,
    updateConversationTitle,
    getActiveConversation,
    activeTool,
    isGenerating,
    setIsGenerating,
    activeGemId,
    userApiKey,
    userId,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConv = getActiveConversation();

  // 站点配置（二维码等，从后台动态读取）
  const [siteConfig, setSiteConfig] = useState<{
    douyinQrUrl: string; douyinAccount: string; douyinDesc: string;
    wechatQrUrl: string; wechatGroupName: string; wechatDesc: string;
    contactWechatId: string; contactQrUrl: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/site-config").then(r => r.json()).then(d => setSiteConfig(d.config)).catch(() => {});
  }, []);

  // 客服消息通知
  const [notifyMsg, setNotifyMsg] = useState<{ content: string; time: string } | null>(null);
  const [showContactChat, setShowContactChat] = useState(false);
  const lastAdminCountRef = useRef(-1);

  useEffect(() => {
    if (!userId) return;
    const checkNewReply = async () => {
      try {
        const resp = await fetch(`/api/contact?userId=${encodeURIComponent(userId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const adminMsgs = (data.messages || []).filter((m: { from: string }) => m.from === "admin");
        if (lastAdminCountRef.current === -1) {
          lastAdminCountRef.current = adminMsgs.length;
          return;
        }
        if (adminMsgs.length > lastAdminCountRef.current) {
          const latest = adminMsgs[adminMsgs.length - 1];
          setNotifyMsg({ content: latest.content, time: new Date(latest.timestamp).toLocaleTimeString("zh-CN") });
          lastAdminCountRef.current = adminMsgs.length;
          setTimeout(() => setNotifyMsg(null), 8000);
        }
      } catch {}
    };
    checkNewReply();
    const timer = setInterval(checkNewReply, 3000);
    return () => clearInterval(timer);
  }, [userId]);
  const [showPromo, setShowPromo] = useState(false);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeConv?.messages.length, scrollToBottom]);

  // Send message
  const handleSend = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      let convId = activeConversationId;

      if (!convId) {
        convId = createConversation();
      }

      addMessage(convId, { role: "user", content, attachments });

      // Auto-title
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
      if (conv && conv.messages.length <= 1) {
        const title = content.length > 30 ? content.slice(0, 30) + "..." : content;
        updateConversationTitle(convId, title);
      }

      const assistantMsgId = addMessage(convId, {
        role: "assistant",
        content: "",
        isStreaming: true,
        toolUsed: activeTool !== "none" ? activeTool : undefined,
      });

      setIsGenerating(true);

      try {
        const state = useChatStore.getState();
        const conversation = state.conversations.find((c) => c.id === convId);
        if (!conversation) return;

        const apiMessages = conversation.messages
          .filter((m) => m.id !== assistantMsgId)
          .map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments?.map((a) => ({
              mimeType: a.mimeType,
              url: a.url,
            })),
          }));

        // 获取当前对话的 Gem 信息
        const currentConv = useChatStore.getState().conversations.find((c) => c.id === convId);
        const gem = currentConv?.gemId ? useChatStore.getState().gems.find((g) => g.id === currentConv.gemId) : undefined;

        // 获取 AI Studio 设置
        const { generationConfig, customSystemInstruction } = useChatStore.getState();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            tool: activeTool,
            gemSystemPrompt: gem?.systemPrompt,
            generationConfig,
            customSystemInstruction: customSystemInstruction || undefined,
            userApiKey: userApiKey || undefined,
            userId,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let errorMsg = "请求失败，请稍后再试";
          let isQuotaIssue = false;
          try {
            const errData = await response.json();
            errorMsg = errData.error || errorMsg;
            isQuotaIssue = !!errData.quotaExhausted;
          } catch {}
          updateMessage(convId!, assistantMsgId, { content: isQuotaIssue ? "" : `⚠️ ${errorMsg}` });
          setMessageStreaming(convId!, assistantMsgId, false);
          setIsGenerating(false);
          if (isQuotaIssue) setShowPromo(true);
          return;
        }

        // === Image generation: non-streaming JSON response ===
        if (activeTool === "image-gen") {
          const data = await response.json();
          if (data.error) {
            updateMessage(convId!, assistantMsgId, { content: "" });
            setShowPromo(true);
          } else {
            updateMessage(convId!, assistantMsgId, {
              content: data.text || "图片已生成：",
              generatedImages: data.images || [],
            });
          }
          setMessageStreaming(convId!, assistantMsgId, false);
          setIsGenerating(false);
          return;
        }

        // === Streaming response (chat / deep-think / deep-research / etc.) ===
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let fullThinking = "";
        let collectedImages: string[] = [];
        let collectedSources: { title: string; url: string }[] = [];

        if (reader) {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const json = JSON.parse(data);
                console.log("[SSE event]", Object.keys(json), json.text?.slice(0, 50) || json.thinking?.slice(0, 50) || "");

                if (json.thinking) {
                  fullThinking += json.thinking;
                  updateMessage(convId!, assistantMsgId, {
                    content: fullContent,
                    thinkingContent: fullThinking,
                  });
                  scrollToBottom();
                }
                if (json.text) {
                  fullContent += json.text;
                  updateMessage(convId!, assistantMsgId, {
                    content: fullContent,
                    thinkingContent: fullThinking || undefined,
                  });
                  scrollToBottom();
                }
                if (json.image) {
                  collectedImages.push(json.image);
                  updateMessage(convId!, assistantMsgId, {
                    content: fullContent,
                    generatedImages: [...collectedImages],
                  });
                }
                if (json.sources) {
                  collectedSources = json.sources;
                  updateMessage(convId!, assistantMsgId, {
                    content: fullContent,
                    groundingSources: collectedSources,
                  });
                }
                if (json.tokenCount) {
                  updateMessage(convId!, assistantMsgId, {
                    content: fullContent,
                    tokenCount: json.tokenCount,
                  });
                }
                if (json.error) {
                  updateMessage(convId!, assistantMsgId, { content: "" });
                  setShowPromo(true);
                }
              } catch (e) {
                console.warn("[SSE parse error]", data?.slice(0, 100), e);
              }
            }
          }
        }

        if (!fullContent && !fullThinking && collectedImages.length === 0) {
          updateMessage(convId!, assistantMsgId, {
            content: "",
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // 用户主动停止，保留已生成的内容
        } else {
          updateMessage(convId!, assistantMsgId, { content: "" });
          setShowPromo(true);
        }
      } finally {
        abortControllerRef.current = null;
        setMessageStreaming(convId!, assistantMsgId, false);
        setIsGenerating(false);
      }
    },
    [
      activeConversationId,
      createConversation,
      addMessage,
      updateMessage,
      setMessageStreaming,
      updateConversationTitle,
      activeTool,
      setIsGenerating,
      scrollToBottom,
      activeGemId,
    ]
  );

  const handleRegenerate = useCallback(() => {
    if (!activeConv || activeConv.messages.length < 2) return;
    const lastUserMsg = [...activeConv.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMsg) {
      handleSend(lastUserMsg.content, lastUserMsg.attachments);
    }
  }, [activeConv, handleSend]);

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // 重新生图：找到该助手消息前的用户消息，强制用 image-gen 工具重新发送
  const handleRegenerateImage = useCallback(
    async (assistantMsgId: string) => {
      if (!activeConv || isGenerating) return;
      const msgIndex = activeConv.messages.findIndex((m) => m.id === assistantMsgId);
      if (msgIndex < 1) return;
      // 向前查找最近的用户消息
      let userMsg = null;
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (activeConv.messages[i].role === "user") {
          userMsg = activeConv.messages[i];
          break;
        }
      }
      if (!userMsg) return;

      const convId = activeConv.id;
      const newAssistantMsgId = addMessage(convId, {
        role: "assistant",
        content: "",
        isStreaming: true,
        toolUsed: "image-gen",
      });

      setIsGenerating(true);
      try {
        const apiMessages = [{
          role: "user" as const,
          content: userMsg.content,
          attachments: userMsg.attachments?.map((a) => ({
            mimeType: a.mimeType,
            url: a.url,
          })),
        }];

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, tool: "image-gen", userApiKey: userApiKey || undefined, userId }),
        });

        if (!response.ok) {
          updateMessage(convId, newAssistantMsgId, { content: "" });
          setShowPromo(true);
        } else {
          const data = await response.json();
          if (data.error) {
            updateMessage(convId, newAssistantMsgId, { content: "" });
            setShowPromo(true);
          } else {
            updateMessage(convId, newAssistantMsgId, {
              content: data.text || "\u56FE\u7247\u5DF2\u91CD\u65B0\u751F\u6210\uFF1A",
              generatedImages: data.images || [],
            });
          }
        }
      } catch (error) {
        updateMessage(convId, newAssistantMsgId, { content: "" });
        setShowPromo(true);
      } finally {
        setMessageStreaming(convId, newAssistantMsgId, false);
        setIsGenerating(false);
      }
    },
    [activeConv, isGenerating, addMessage, updateMessage, setMessageStreaming, setIsGenerating, userApiKey, userId]
  );

  // 图片标记编辑：将标注后的图片 + 修改指令发送给 image-gen
  const handleEditImage = useCallback(
    async (annotatedImageDataUrl: string, instruction: string) => {
      if (!activeConv || isGenerating) return;
      const convId = activeConv.id;

      // 添加用户消息（带标注图片 + 修改指令）
      const attachment: Attachment = {
        id: Date.now().toString(),
        name: "annotated-image.png",
        type: "image",
        url: annotatedImageDataUrl,
        mimeType: "image/png",
      };
      addMessage(convId, {
        role: "user",
        content: instruction,
        attachments: [attachment],
      });

      // 添加助手占位消息
      const assistantMsgId = addMessage(convId, {
        role: "assistant",
        content: "",
        isStreaming: true,
        toolUsed: "image-gen",
      });

      setIsGenerating(true);
      scrollToBottom();

      try {
        const apiMessages = [{
          role: "user" as const,
          content: `Please edit the image based on the red markings. The red/highlighted areas indicate regions to modify. Instruction: ${instruction}`,
          attachments: [{ mimeType: "image/png", url: annotatedImageDataUrl }],
        }];

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, tool: "image-gen", userApiKey: userApiKey || undefined, userId }),
        });

        if (!response.ok) {
          updateMessage(convId, assistantMsgId, { content: "" });
          setShowPromo(true);
        } else {
          const data = await response.json();
          if (data.error) {
            updateMessage(convId, assistantMsgId, { content: "" });
            setShowPromo(true);
          } else {
            updateMessage(convId, assistantMsgId, {
              content: data.text || "图片已编辑：",
              generatedImages: data.images || [],
            });
          }
        }
      } catch (error) {
        updateMessage(convId, assistantMsgId, { content: "" });
        setShowPromo(true);
      } finally {
        setMessageStreaming(convId, assistantMsgId, false);
        setIsGenerating(false);
        scrollToBottom();
      }
    },
    [activeConv, isGenerating, addMessage, updateMessage, setMessageStreaming, setIsGenerating, scrollToBottom, userApiKey, userId]
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <header className="flex items-center gap-2 px-2 sm:px-4 h-14 shrink-0 border-b border-[var(--border)] safe-top">
          {!sidebarOpen && (
            <>
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                <Menu size={20} />
              </button>
              <button
                onClick={() => createConversation()}
                className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                <SquarePen size={20} />
              </button>
            </>
          )}
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-blue-500" />
            <span className="font-semibold text-lg">OpenSpeech</span>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto">
          {!activeConv || activeConv.messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="max-w-2xl w-full text-center space-y-6">
                <div className="space-y-2">
                  <h1 className="text-3xl sm:text-4xl font-semibold">
                    <span className="app-gradient">你好</span>
                  </h1>
                  <h2 className="text-xl sm:text-2xl font-medium text-[var(--foreground)]">
                    需要我为你做些什么？
                  </h2>
                </div>

                {/* Welcome banner */}
                <div className="bg-[var(--card)] rounded-2xl p-4 border border-[var(--border)] text-left max-w-2xl mx-auto">
                  <p className="text-sm font-medium mb-1">
                    欢迎使用 <span className="app-gradient font-semibold">OpenSpeech</span>，你的 AI 助手
                  </p>
                  <p className="text-xs text-[var(--muted)] mb-3">
                    支持多轮对话、文件上传、代码高亮、深度研究等功能。
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-[var(--sidebar-hover)] cursor-pointer hover:opacity-80" onClick={() => { if (!activeConversationId) createConversation(); useChatStore.getState().setActiveTool("deep-think"); }}>
                      <span className="text-lg">🧠</span>
                      <p className="mt-0.5">深度推理</p>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--sidebar-hover)] cursor-pointer hover:opacity-80" onClick={() => { if (!activeConversationId) createConversation(); useChatStore.getState().setActiveTool("image-gen"); }}>
                      <span className="text-lg">🎨</span>
                      <p className="mt-0.5">AI 生图</p>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--sidebar-hover)] cursor-pointer hover:opacity-80" onClick={() => { if (!activeConversationId) createConversation(); useChatStore.getState().setActiveTool("deep-research"); }}>
                      <span className="text-lg">🔍</span>
                      <p className="mt-0.5">深度研究</p>
                    </div>
                  </div>
                </div>

                {/* 二维码并排区域（从管理后台动态配置） */}
                <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4">
                  {/* 抖音 */}
                  <div className="bg-[var(--card)] rounded-2xl p-4 border border-[var(--border)] flex flex-col items-center text-center gap-3">
                    <img src={siteConfig?.douyinQrUrl || "/douyin-qr.png"} alt="抖音" className="w-32 h-32 rounded-xl" />
                    <div>
                      <p className="text-sm font-semibold">关注抖音号 {siteConfig?.douyinAccount || "arch8288"}</p>
                      <p className="text-[11px] text-[var(--muted)] mt-1">{siteConfig?.douyinDesc || "免费体验卡 · 教程 · 功能更新"}</p>
                    </div>
                  </div>
                  {/* 微信群 */}
                  <div className="bg-[var(--card)] rounded-2xl p-4 border border-[var(--border)] flex flex-col items-center text-center gap-3">
                    <img src={siteConfig?.wechatQrUrl || "/wechat-qr.png"} alt="微信群" className="w-32 h-32 rounded-xl" />
                    <div>
                      <p className="text-sm font-semibold">加入「{siteConfig?.wechatGroupName || "Open-speech 超级梦想家"}」群</p>
                      <p className="text-[11px] text-[var(--muted)] mt-1">{siteConfig?.wechatDesc || "微信扫码 · 把想法变成现实"}</p>
                    </div>
                  </div>
                </div>
                {/* 群介绍 */}
                <div className="max-w-2xl mx-auto bg-[var(--card)] rounded-2xl p-4 border border-[var(--border)] text-xs text-[var(--muted)] leading-relaxed space-y-1.5">
                  <p className="font-medium text-[var(--foreground)]">🔥 这里只干一件事——把想法变成现实</p>
                  <p>你有脑洞，我有技术；你有梦想，我有落地能力。本群专为敢想、敢做、敢折腾的人而生。</p>
                  <p>创业点子、工具需求、小程序/APP/网站、AI工具、自动化脚本……只要你说得出，我就帮你：梳理逻辑 → 设计方案 → 给出路径 → 手把手落地。</p>
                  <p className="font-medium text-[var(--foreground)]">不画饼、不空谈。你的超级梦想，从这里开始上线。</p>
                </div>
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="max-w-3xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
              {activeConv.messages.filter((m) => m.role === "user" || m.content || m.isStreaming || (m.generatedImages && m.generatedImages.length > 0)).map((msg, i, arr) => (
                <div key={msg.id} className="group">
                  <ChatMessage
                    message={msg}
                    isLast={i === activeConv.messages.length - 1 && msg.role === "assistant"}
                    onRegenerate={handleRegenerate}
                    onRegenerateImage={handleRegenerateImage}
                    onEditImage={handleEditImage}
                  />
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 pb-2 sm:pb-4 pt-2 overflow-visible safe-bottom">
          <ChatInput onSend={handleSend} disabled={isGenerating} onStop={handleStop} />
        </div>
      </main>

      {/* 客服消息通知气泡 */}
      {notifyMsg && !showContactChat && (
        <div
          className="fixed bottom-20 right-6 z-40 max-w-xs animate-fade-in cursor-pointer"
          onClick={() => { setNotifyMsg(null); setShowContactChat(true); }}
        >
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs font-medium">客服回复</span>
              <span className="text-[10px] text-[var(--muted)] ml-auto">{notifyMsg.time}</span>
            </div>
            <p className="text-sm line-clamp-3">{notifyMsg.content}</p>
            <p className="text-[10px] text-blue-500 mt-2">点击查看对话 →</p>
          </div>
        </div>
      )}

      {/* 右下角客服聊天小窗 */}
      {showContactChat && (
        <ContactMiniChat userId={userId} onClose={() => setShowContactChat(false)} />
      )}

      {/* 推广弹窗 */}
      {showPromo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPromo(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl p-6 max-w-sm w-full text-center shadow-xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-red-500 dark:text-red-400 mb-3">额度不足</p>
            <p className="text-xs text-[var(--muted)] mb-4">
              免费额度已用完，兑换体验卡或填入 API Key 可解锁更多次数
            </p>
            <img
              src={siteConfig?.douyinQrUrl || "/douyin-qr.png"}
              alt="抖音二维码"
              className="w-52 h-auto mx-auto rounded-xl mb-3"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <p className="text-base font-semibold mb-1">抖音号：{siteConfig?.douyinAccount || "arch8288"}</p>
            <p className="text-sm text-[var(--muted)] mb-4">
              关注获取兑换码 · 小黄车购买体验卡
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPromo(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                我知道了
              </button>
              <button
                onClick={() => { setShowPromo(false); useChatStore.getState().toggleSettingsPanel(); }}
                className="flex-1 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
              >
                去兑换
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
