"use client";

import { memo, useState, useCallback } from "react";
import { ImageEditor } from "./image-editor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import type { Message } from "@/store/chat-store";
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Share2,
  User,
  Sparkles,
  Brain,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Download,
  Pencil,
} from "lucide-react";

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onRegenerateImage?: (messageId: string) => void;
  onEditImage?: (annotatedImageDataUrl: string, instruction: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <div className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
      <div className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
      <div className="typing-dot w-2 h-2 rounded-full bg-blue-500" />
    </div>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group rounded-xl overflow-hidden my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-gray-300 text-xs">
        <span>{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.85rem" }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

function ThinkingBlock({ content, isStreaming, hasContent }: { content: string; isStreaming?: boolean; hasContent?: boolean }) {
  // 如果没有正文内容，自动展开思考过程
  const [expanded, setExpanded] = useState(!hasContent);

  return (
    <div className="mb-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors"
      >
        <Brain size={16} className={isStreaming ? "animate-pulse" : ""} />
        <span>{isStreaming ? "正在思考..." : "思考过程"}</span>
        <span className="text-xs text-purple-500/60 ml-1">({content.length} 字)</span>
        {expanded ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs text-purple-600/80 dark:text-purple-400/80 whitespace-pre-wrap border-t border-purple-200/50 dark:border-purple-800/50 max-h-96 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

function GroundingSources({ sources }: { sources: { title: string; url: string }[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="text-xs font-medium text-[var(--muted)] mb-2">搜索来源</div>
      <div className="flex flex-wrap gap-2">
        {sources.slice(0, 8).map((src, i) => (
          <a
            key={i}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <ExternalLink size={10} />
            <span className="truncate max-w-[200px]">{src.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function GeneratedImages({
  images,
  onEditImage,
}: {
  images: string[];
  onEditImage?: (annotatedImageDataUrl: string, instruction: string) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState("");

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-3">
        {images.map((img, i) => (
          <div key={i} className="relative group rounded-xl overflow-hidden border border-[var(--border)] shadow-sm">
            <img src={img} alt={`生成图片 ${i + 1}`} className="max-h-60 sm:max-h-80 max-w-full object-contain" />
            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEditImage && (
                <button
                  onClick={() => setEditingIdx(i)}
                  className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70"
                  title="标记编辑"
                >
                  <Pencil size={14} />
                </button>
              )}
              <a
                href={img}
                download={`openspeech-image-${i + 1}.png`}
                className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70"
                title="下载图片"
              >
                <Download size={14} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* 图片编辑器弹窗 */}
      {editingIdx !== null && onEditImage && (
        <ImageEditor
          imageSrc={images[editingIdx]}
          onSave={(annotatedUrl) => {
            setEditingIdx(null);
            setPendingAnnotation(annotatedUrl);
            setEditInstruction("");
          }}
          onClose={() => setEditingIdx(null)}
        />
      )}

      {/* 编辑指令输入弹窗（替代 window.prompt，移动端友好） */}
      {pendingAnnotation && onEditImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setPendingAnnotation(null); setEditInstruction(""); }}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">描述修改内容</h3>
            <p className="text-xs text-[var(--muted)]">已保存标注，请描述你想让 AI 怎么改这张图</p>
            <input
              type="text"
              autoFocus
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editInstruction.trim()) {
                  onEditImage(pendingAnnotation!, editInstruction.trim());
                  setPendingAnnotation(null);
                  setEditInstruction("");
                }
              }}
              placeholder="如：把标记区域改成蓝色天空"
              className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPendingAnnotation(null); setEditInstruction(""); }}
                className="px-4 py-2 rounded-xl text-sm border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (editInstruction.trim()) {
                    onEditImage(pendingAnnotation!, editInstruction.trim());
                    setPendingAnnotation(null);
                    setEditInstruction("");
                  }
                }}
                disabled={!editInstruction.trim()}
                className="px-4 py-2 rounded-xl text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                发送修改
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !className;
            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock language={match?.[1] || ""}>
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  "deep-think": "🧠 Deep Think",
  "deep-research": "🔍 Deep Research",
  canvas: "✏️ Canvas",
  "image-gen": "🎨 图片生成",
  tutor: "📚 学习辅导",
  "code-assist": "💻 代码助手",
  notebook: "📄 文档分析",
};

export const ChatMessage = memo(function ChatMessage({
  message,
  isLast,
  onRegenerate,
  onRegenerateImage,
  onEditImage,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [liked, setLiked] = useState<"up" | "down" | null>(null);

  return (
    <div
      className={cn(
        "flex gap-2 sm:gap-3 py-3 sm:py-4 animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
          <Sparkles size={14} className="text-white sm:hidden" />
          <Sparkles size={16} className="text-white hidden sm:block" />
        </div>
      )}

      <div className={cn("max-w-[92%] sm:max-w-[85%] min-w-0", isUser && "order-first")}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {message.attachments.map((att, idx) => (
              <div key={att.id} className="relative rounded-xl overflow-hidden border border-[var(--border)]">
                {att.type === "image" ? (
                  <img src={att.url} alt={att.name} className="max-h-32 sm:max-h-48 max-w-[200px] sm:max-w-xs object-contain" />
                ) : (
                  <div className="px-3 py-2 text-sm text-[var(--muted)]">
                    {att.mimeType.startsWith("audio/") ? "🎵" : att.mimeType.startsWith("video/") ? "🎬" : "📎"} {att.name}
                  </div>
                )}
                {/* 编号角标 */}
                {message.attachments!.length > 1 && (
                  <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                    {idx + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Thinking process (Deep Think) */}
        {!isUser && message.thinkingContent && (
          <ThinkingBlock content={message.thinkingContent} isStreaming={message.isStreaming && !message.content} hasContent={!!message.content} />
        )}

        {/* Message content */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser ? "bg-blue-500 text-white ml-auto" : "bg-transparent"
          )}
        >
          {message.isStreaming && !message.content && !message.thinkingContent ? (
            <TypingIndicator />
          ) : isUser ? (
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
          ) : message.content ? (
            <MarkdownContent content={message.content} />
          ) : null}
        </div>

        {/* Generated images */}
        {!isUser && <GeneratedImages images={message.generatedImages || []} onEditImage={onEditImage} />}

        {/* 重新生图按钮 */}
        {!isUser && !message.isStreaming && message.generatedImages && message.generatedImages.length > 0 && onRegenerateImage && (
          <button
            onClick={() => onRegenerateImage(message.id)}
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          >
            <RotateCcw size={12} />
            重新生图
          </button>
        )}

        {/* Grounding sources (Deep Research) */}
        {!isUser && <GroundingSources sources={message.groundingSources || []} />}

        {/* Tool badge */}
        {message.toolUsed && TOOL_LABELS[message.toolUsed] && (
          <div className="mt-1">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-xs">
              {TOOL_LABELS[message.toolUsed]}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isUser && !message.isStreaming && (message.content || (message.generatedImages && message.generatedImages.length > 0)) && (
          <div className="flex items-center gap-1 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:hover:opacity-100 transition-opacity">
            <button
              onClick={() => setLiked(liked === "up" ? null : "up")}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                liked === "up"
                  ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
              )}
              title="有用"
            >
              <ThumbsUp size={14} />
            </button>
            <button
              onClick={() => setLiked(liked === "down" ? null : "down")}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                liked === "down"
                  ? "text-red-500 bg-red-50 dark:bg-red-900/20"
                  : "text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
              )}
              title="无用"
            >
              <ThumbsDown size={14} />
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(message.content)}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--sidebar-hover)] transition-colors"
              title="复制"
            >
              <Copy size={14} />
            </button>
            {isLast && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--sidebar-hover)] transition-colors"
                title="重新生成"
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button
              onClick={() => {
                const text = message.content + (message.generatedImages?.length ? "\n[包含AI生成图片]" : "");
                navigator.clipboard.writeText(text);
              }}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--sidebar-hover)] transition-colors"
              title="复制全文"
            >
              <Share2 size={14} />
            </button>
          </div>
        )}
      </div>

      {isUser && (
        <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
          <User size={14} className="text-white sm:hidden" />
          <User size={16} className="text-white hidden sm:block" />
        </div>
      )}
    </div>
  );
});
