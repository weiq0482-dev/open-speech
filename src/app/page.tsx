"use client";

import { useRef, useEffect, useCallback } from "react";
import { useChatStore, type Attachment } from "@/store/chat-store";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage } from "@/components/chat-message";
import { SettingsPanel } from "@/components/settings-panel";
import { Menu, SquarePen, Sparkles, Sliders } from "lucide-react";

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
    settingsPanelOpen,
    toggleSettingsPanel,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConv = getActiveConversation();

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
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const err = await response.json();
          updateMessage(convId!, assistantMsgId, {
            content: `❌ 请求失败: ${err.error || response.statusText}\n\n${err.details || ""}`,
          });
          setMessageStreaming(convId!, assistantMsgId, false);
          setIsGenerating(false);
          return;
        }

        // === Image generation: non-streaming JSON response ===
        if (activeTool === "image-gen") {
          const data = await response.json();
          if (data.error) {
            updateMessage(convId!, assistantMsgId, {
              content: `❌ ${data.error}\n\n${data.details || ""}`,
            });
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
                  fullContent += `\n\n❌ ${json.error}`;
                  updateMessage(convId!, assistantMsgId, { content: fullContent });
                }
              } catch (e) {
                console.warn("[SSE parse error]", data?.slice(0, 100), e);
              }
            }
          }
        }

        if (!fullContent && !fullThinking && collectedImages.length === 0) {
          updateMessage(convId!, assistantMsgId, {
            content: "⚠️ 未收到回复，请检查 API 配置。",
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // 用户主动停止，保留已生成的内容
        } else {
          updateMessage(convId!, assistantMsgId, {
            content: `❌ 网络错误: ${error instanceof Error ? error.message : String(error)}`,
          });
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
          body: JSON.stringify({ messages: apiMessages, tool: "image-gen" }),
        });

        if (!response.ok) {
          const err = await response.json();
          updateMessage(convId, newAssistantMsgId, {
            content: `\u274C \u8BF7\u6C42\u5931\u8D25: ${err.error || response.statusText}`,
          });
        } else {
          const data = await response.json();
          if (data.error) {
            updateMessage(convId, newAssistantMsgId, {
              content: `\u274C ${data.error}`,
            });
          } else {
            updateMessage(convId, newAssistantMsgId, {
              content: data.text || "\u56FE\u7247\u5DF2\u91CD\u65B0\u751F\u6210\uFF1A",
              generatedImages: data.images || [],
            });
          }
        }
      } catch (error) {
        updateMessage(convId, newAssistantMsgId, {
          content: `\u274C \u7F51\u7EDC\u9519\u8BEF: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        setMessageStreaming(convId, newAssistantMsgId, false);
        setIsGenerating(false);
      }
    },
    [activeConv, isGenerating, addMessage, updateMessage, setMessageStreaming, setIsGenerating]
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
          body: JSON.stringify({ messages: apiMessages, tool: "image-gen" }),
        });

        if (!response.ok) {
          const err = await response.json();
          updateMessage(convId, assistantMsgId, {
            content: `❌ 请求失败: ${err.error || response.statusText}`,
          });
        } else {
          const data = await response.json();
          if (data.error) {
            updateMessage(convId, assistantMsgId, {
              content: `❌ ${data.error}`,
            });
          } else {
            updateMessage(convId, assistantMsgId, {
              content: data.text || "图片已编辑：",
              generatedImages: data.images || [],
            });
          }
        }
      } catch (error) {
        updateMessage(convId, assistantMsgId, {
          content: `❌ 网络错误: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        setMessageStreaming(convId, assistantMsgId, false);
        setIsGenerating(false);
        scrollToBottom();
      }
    },
    [activeConv, isGenerating, addMessage, updateMessage, setMessageStreaming, setIsGenerating, scrollToBottom]
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
            <Sparkles size={20} className="text-gemini-blue" />
            <span className="font-semibold text-lg">OpenSpeech</span>
          </div>
          <div className="ml-auto">
            <button
              onClick={toggleSettingsPanel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-sm ${
                settingsPanelOpen
                  ? "bg-blue-100 text-gemini-blue dark:bg-blue-900/30"
                  : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
              }`}
              title="运行设置 (AI Studio)"
            >
              <Sliders size={16} />
              <span className="hidden sm:inline">设置</span>
            </button>
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
                    <span className="gemini-gradient">你好</span>
                  </h1>
                  <h2 className="text-xl sm:text-2xl font-medium text-[var(--foreground)]">
                    需要我为你做些什么？
                  </h2>
                </div>

                {/* Welcome banner */}
                <div className="bg-[var(--card)] rounded-2xl p-4 border border-[var(--border)] text-left max-w-xl mx-auto">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium mb-1">
                        欢迎使用 <span className="gemini-gradient font-semibold">OpenSpeech</span>，你的 AI 助手
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        基于 Gemini 大模型，支持多轮对话、文件上传、代码高亮、Deep Research 等功能。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="max-w-3xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
              {activeConv.messages.map((msg, i) => (
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

      {/* AI Studio Settings Panel */}
      <SettingsPanel />
    </div>
  );
}
