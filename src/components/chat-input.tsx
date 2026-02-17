"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore, type ToolMode, type Attachment } from "@/store/chat-store";
import { cn, generateId } from "@/lib/utils";
import {
  Plus,
  Wrench,
  Mic,
  Send,
  Square,
  X,
  Search,
  Palette,
  PenTool,
  GraduationCap,
  ImageIcon,
  FileText,
  Brain,
  Code,
  FileSearch,
  Sparkles,
} from "lucide-react";

const TOOLS: { id: ToolMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "deep-think", label: "Deep Think", icon: <Brain size={16} />, desc: "深度推理，展示思考过程" },
  { id: "deep-research", label: "Deep Research", icon: <Search size={16} />, desc: "联网搜索，生成研究报告" },
  { id: "image-gen", label: "生成图片", icon: <Palette size={16} />, desc: "AI 文字生图 / 图片编辑" },
  { id: "canvas", label: "Canvas", icon: <PenTool size={16} />, desc: "创意写作助手" },
  { id: "code-assist", label: "代码助手", icon: <Code size={16} />, desc: "代码生成/调试/重构" },
  { id: "tutor", label: "学习辅导", icon: <GraduationCap size={16} />, desc: "循序渐进的学习辅导" },
  { id: "notebook", label: "文档分析", icon: <FileSearch size={16} />, desc: "上传文档进行分析问答" },
];

const SUGGESTIONS = [
  "帮我解释量子计算",
  "给我写一个 Python 爬虫",
  "帮我学习",
  "给我的一天计划",
];

const IMAGE_ACTIONS = [
  { label: "🔍 找相似图", prompt: "帮我找与这张图片相似的图片，描述图片的关键特征和风格" },
  { label: "🎬 生成视频", prompt: "根据这张图片的内容，帮我写一段视频脚本，描述如何将这个画面做成一个短视频" },
  { label: "✨ 变清晰", prompt: "请分析这张图片，帮我用AI生成一张更清晰、更高分辨率的版本" },
  { label: "💧 去水印", prompt: "请帮我去除这张图片上的水印，生成一张干净的版本" },
  { label: "❓ 这是什么", prompt: "请详细描述这张图片中的内容，这是什么？包括物体、场景、文字等所有信息" },
  { label: "📝 解答题目", prompt: "请仔细阅读图片中的题目，给出详细的解答过程和答案" },
  { label: "🌐 翻译", prompt: "请识别图片中的所有文字，并翻译成中文（如果已经是中文则翻译成英文）" },
  { label: "📋 提取文字", prompt: "请识别并提取图片中的所有文字内容，保持原始格式" },
];

interface ChatInputProps {
  onSend: (content: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  onStop?: () => void;
}

export function ChatInput({ onSend, disabled, onStop }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imageResolution, setImageResolution] = useState<"standard" | "2k" | "4k">("standard");
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [toolsPos, setToolsPos] = useState<{ bottom: number; left: number } | null>(null);

  const {
    activeTool,
    setActiveTool,
    isGenerating,
    getActiveConversation,
    activeGemId,
    getGemById,
  } = useChatStore();

  const activeConv = getActiveConversation();
  const isEmpty = !activeConv || activeConv.messages.length === 0;
  const activeGem = activeGemId ? getGemById(activeGemId) : undefined;

  // 计算工具菜单位置
  useEffect(() => {
    if (showTools && toolsBtnRef.current) {
      const rect = toolsBtnRef.current.getBoundingClientRect();
      setToolsPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
    }
  }, [showTools]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setShowTools(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, []);

  // 处理文件（通用：上传、粘贴、拖放）
  const addFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const att: Attachment = {
          id: generateId(),
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : "document",
          url: reader.result as string,
          mimeType: file.type,
        };
        setAttachments((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled || isGenerating) return;
    // 图片生成时附加分辨率指令
    let finalContent = trimmed;
    if (activeTool === "image-gen" && imageResolution !== "standard" && trimmed) {
      const resMap = { "2k": "2048x2048 (2K high resolution)", "4k": "4096x4096 (4K ultra high resolution)" };
      finalContent = `${trimmed}\n\n[Output resolution: ${resMap[imageResolution]}, ensure maximum detail and clarity]`;
    }
    onSend(finalContent, attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 粘贴图片支持
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    addFiles(files);
    e.target.value = "";
  };

  // 拖放支持
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-2 sm:px-4">
      {/* Suggestion chips - only show when conversation is empty */}
      {isEmpty && (
        <div className="flex flex-wrap gap-2 justify-center mb-4 px-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setInput(s);
                textareaRef.current?.focus();
              }}
              className="px-3 sm:px-4 py-2 rounded-full border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors text-xs sm:text-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {attachments.map((att, idx) => (
            <div
              key={att.id}
              className="relative group rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--card)]"
            >
              {att.type === "image" ? (
                <img
                  src={att.url}
                  alt={att.name}
                  className="h-20 w-20 object-cover"
                />
              ) : (
                <div className="h-20 w-20 flex flex-col items-center justify-center gap-1 px-2">
                  <FileText size={24} className="text-[var(--muted)]" />
                  <span className="text-[10px] text-[var(--muted)] truncate w-full text-center">
                    {att.name}
                  </span>
                </div>
              )}
              {/* 编号角标 */}
              <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                {idx + 1}
              </div>
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/50 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 多图参考提示 */}
      {attachments.filter((a) => a.type === "image").length > 1 && (
        <div className="text-[10px] text-[var(--muted)] mb-1 px-1">
          💡 可用编号引用图片，如「参考图1的风格 + 图2的构图」
        </div>
      )}

      {/* Image quick actions - show when image attached */}
      {attachments.some((a) => a.type === "image") && (
        <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-hide">
          {IMAGE_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                onSend(action.prompt, attachments);
                setAttachments([]);
                setInput("");
              }}
              disabled={disabled || isGenerating}
              className="shrink-0 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--sidebar-hover)] transition-colors text-xs whitespace-nowrap"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Main input card */}
      <div
        ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border bg-[var(--card)] shadow-sm overflow-hidden transition-colors",
          isDragging
            ? "border-blue-500 border-2 bg-blue-50/50 dark:bg-blue-900/10"
            : "border-[var(--border)]"
        )}
      >
        {/* Drag overlay hint */}
        {isDragging && (
          <div className="flex items-center justify-center py-4 text-sm text-blue-500 font-medium">
            <ImageIcon size={18} className="mr-2" />
            松开即可添加文件
          </div>
        )}

        {/* Active Gem indicator */}
        {activeGem && (
          <div className="flex items-center gap-2 px-3 pt-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm">
              <span>{activeGem.icon}</span>
              <span className="font-medium">{activeGem.name}</span>
            </div>
          </div>
        )}

        {/* Model auto-select label */}
        {!activeGem && (
          <div className="flex items-center gap-1 px-3 pt-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--muted)]">
              <Sparkles size={14} className="text-blue-500" />
              <span>OpenSpeech</span>
              {activeTool !== "none" && (
                <span className="text-xs text-blue-500 ml-1">
                  · {TOOLS.find((t) => t.id === activeTool)?.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Textarea */}
        <div className="px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={activeGem ? `向 ${activeGem.name} 提问...` : "输入消息，或粘贴图片..."}
            disabled={disabled || isGenerating}
            className="chat-input w-full bg-transparent outline-none text-sm leading-6 placeholder:text-[var(--muted)] resize-none"
            rows={1}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            {/* File upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] transition-colors text-[var(--muted)]"
              title="上传文件（图片、音频、视频、文档）"
            >
              <Plus size={20} />
            </button>

            {/* Tools dropdown */}
            <div ref={toolsRef}>
              <button
                ref={toolsBtnRef}
                onClick={() => setShowTools(!showTools)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-sm",
                  activeTool !== "none"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
                )}
              >
                <Wrench size={16} />
                工具
              </button>
              {showTools && toolsPos && (
                <div
                  className="fixed w-56 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg py-1 z-[9999] animate-fade-in max-h-[60vh] overflow-y-auto"
                  style={{ bottom: toolsPos.bottom, left: toolsPos.left }}
                >
                  {TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setActiveTool(tool.id);
                        setShowTools(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--sidebar-hover)] transition-colors flex items-center gap-3",
                        activeTool === tool.id && "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                      )}
                    >
                      {tool.icon}
                      <div>
                        <div className="font-medium">{tool.label}</div>
                        <div className="text-xs text-[var(--muted)]">{tool.desc}</div>
                      </div>
                    </button>
                  ))}
                  {activeTool !== "none" && (
                    <>
                      <div className="border-t border-[var(--border)] my-1" />
                      <button
                        onClick={() => {
                          setActiveTool("none");
                          setShowTools(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        关闭工具
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Active tool indicator */}
            {activeTool !== "none" && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-xs">
                {TOOLS.find((t) => t.id === activeTool)?.label}
                <button
                  onClick={() => setActiveTool("none")}
                  className="ml-0.5 hover:text-blue-800"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* 图片分辨率选择器 */}
            {activeTool === "image-gen" && (
              <div className="flex items-center gap-0.5 ml-1">
                {(["standard", "2k", "4k"] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => setImageResolution(res)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                      imageResolution === res
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        : "text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
                    )}
                  >
                    {res === "standard" ? "标准" : res.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Voice input */}
            <button
              className="p-2 rounded-full hover:bg-[var(--sidebar-hover)] transition-colors text-[var(--muted)]"
              title="语音输入"
            >
              <Mic size={20} />
            </button>

            {/* Send / Stop */}
            {isGenerating ? (
              <button
                onClick={onStop}
                className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors animate-pulse"
                title="停止生成"
              >
                <Square size={18} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() && attachments.length === 0}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  input.trim() || attachments.length > 0
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "text-[var(--muted)] cursor-not-allowed"
                )}
                title="发送"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-center mt-2 text-[10px] text-[var(--muted)]">
        AI 助手仅供交流学习、内容仅供参考
      </div>
    </div>
  );
}
