"use client";

import { useState, useRef } from "react";
import { useNotebookStore, NotebookSource } from "@/store/notebook-store";
import {
  Plus,
  FileText,
  Globe,
  Type,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  Link,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

// PDF 文本提取（客户端）
async function extractTextFromFile(file: File): Promise<{ text: string; title: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
    const text = await file.text();
    return { text, title: file.name };
  }

  if (ext === "pdf") {
    // 动态加载 pdf.js
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageText = content.items.map((item: any) => item.str || "").join(" ");
      fullText += pageText + "\n";
    }
    return { text: fullText, title: file.name };
  }

  // 其他文件类型尝试读取为文本
  try {
    const text = await file.text();
    return { text, title: file.name };
  } catch {
    throw new Error(`不支持的文件类型: ${ext}`);
  }
}

const SOURCE_ICONS: Record<string, typeof FileText> = {
  file: FileText,
  url: Globe,
  text: Type,
  video: Video,
  knowledge: FileText,
};

export function NotebookSources({
  notebookId,
  userId,
}: {
  notebookId: string;
  userId: string;
}) {
  const { sources, loadingSources, addSource, deleteSource, toggleSource } = useNotebookStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"file" | "url" | "text" | "video">("file");
  const [urlInput, setUrlInput] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transcriptPrompt, setTranscriptPrompt] = useState<{ title: string; content: string; url: string; platform: string; author: string } | null>(null);
  const [manualTranscript, setManualTranscript] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const { text, title } = await extractTextFromFile(file);
        if (text.trim().length < 10) {
          alert(`"${file.name}" 没有提取到有效文本`);
          continue;
        }
        await addSource(userId, notebookId, {
          type: "file",
          title,
          content: text,
          metadata: { fileName: file.name, fileType: file.type, wordCount: text.length },
        });
      } catch (err) {
        alert(`上传 "${file.name}" 失败: ${err instanceof Error ? err.message : "未知错误"}`);
      }
    }
    setUploading(false);
    setShowAdd(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUrlAdd = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUploading(true);
    try {
      // 使用后端获取 URL 内容（避免 CORS）
      const resp = await fetch("/api/notebook/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (resp.ok) {
        const data = await resp.json();
        await addSource(userId, notebookId, {
          type: "url",
          title: data.title || url,
          content: data.content || "",
          metadata: { url, wordCount: (data.content || "").length },
        });
        setUrlInput("");
        setShowAdd(false);
      } else {
        alert("获取网页内容失败，请检查 URL");
      }
    } catch {
      alert("网络错误");
    }
    setUploading(false);
  };

  const handleVideoAdd = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUploading(true);
    try {
      const resp = await fetch("/api/notebook/fetch-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (resp.ok) {
        const data = await resp.json();
        // 仅 YouTube 字幕失败时弹出手动粘贴框（其他平台有音频转录兜底，直接保存）
        if (!data.hasTranscript && data.platform === "YouTube") {
          setTranscriptPrompt({
            title: data.title || "视频",
            content: data.content || "",
            url,
            platform: data.platform || "",
            author: data.author || "",
          });
          setManualTranscript("");
          setUploading(false);
          return;
        }
        await addSource(userId, notebookId, {
          type: "video",
          title: data.title || "视频",
          content: data.content || "",
          metadata: { url, platform: data.platform, author: data.author, wordCount: (data.content || "").length },
        });
        setUrlInput("");
        setShowAdd(false);
      } else {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || "解析视频失败");
      }
    } catch {
      alert("网络错误");
    }
    setUploading(false);
  };

  // 手动粘贴字幕后保存视频来源
  const handleSaveWithTranscript = async () => {
    if (!transcriptPrompt) return;
    setUploading(true);
    let finalContent = transcriptPrompt.content;
    if (manualTranscript.trim()) {
      finalContent += "\n\n===== 视频字幕/转录文本 =====\n" + manualTranscript.trim() + "\n===== 字幕结束 =====";
    }
    await addSource(userId, notebookId, {
      type: "video",
      title: transcriptPrompt.title,
      content: finalContent,
      metadata: {
        url: transcriptPrompt.url,
        platform: transcriptPrompt.platform,
        author: transcriptPrompt.author,
        wordCount: finalContent.length,
      },
    });
    setTranscriptPrompt(null);
    setManualTranscript("");
    setUrlInput("");
    setShowAdd(false);
    setUploading(false);
  };

  const handleTextAdd = async () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    setUploading(true);
    await addSource(userId, notebookId, {
      type: "text",
      title: textTitle.trim(),
      content: textContent.trim(),
      metadata: { wordCount: textContent.trim().length },
    });
    setTextTitle("");
    setTextContent("");
    setShowAdd(false);
    setUploading(false);
  };

  const filteredSources = searchQuery
    ? sources.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sources;

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div className="flex flex-col h-full">
      {/* 手动粘贴字幕弹窗 */}
      {transcriptPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTranscriptPrompt(null)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">视频字幕提取失败</h3>
            <p className="text-sm text-[var(--muted)]">
              「{transcriptPrompt.title}」未能自动获取字幕。
              你可以手动粘贴字幕文本，也可以跳过直接保存。
            </p>
            <div className="text-xs text-[var(--muted)] bg-[var(--sidebar-hover)] rounded-lg p-3 space-y-1">
              <p className="font-medium text-[var(--foreground)]">如何获取字幕：</p>
              {transcriptPrompt.platform === "YouTube" && (
                <>
                  <p>1. 在 YouTube 视频下方点击「...更多」→「显示转录稿」</p>
                  <p>2. 复制全部文字，粘贴到下方</p>
                </>
              )}
              {transcriptPrompt.platform === "B站" && (
                <>
                  <p>1. 在 B站 视频页面打开「CC字幕」（如果有的话）</p>
                  <p>2. 或使用浏览器插件提取字幕文本</p>
                </>
              )}
              {transcriptPrompt.platform !== "YouTube" && transcriptPrompt.platform !== "B站" && (
                <p>请从视频平台复制字幕或转录文本</p>
              )}
            </div>
            <textarea
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              placeholder="在此粘贴视频字幕或转录文本..."
              className="w-full h-32 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm resize-none outline-none focus:border-blue-400"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setTranscriptPrompt(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
              >
                取消
              </button>
              <button
                onClick={handleSaveWithTranscript}
                disabled={uploading}
                className="px-4 py-2 rounded-lg text-sm bg-gray-200 dark:bg-gray-700 text-[var(--foreground)] hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                跳过字幕，直接保存
              </button>
              <button
                onClick={handleSaveWithTranscript}
                disabled={uploading || !manualTranscript.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {uploading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-3 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            来源
          </h3>
          <span className="text-[10px] text-[var(--muted)]">
            {enabledCount}/{sources.length} 个启用
          </span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border border-dashed border-[var(--border)] hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-xs text-[var(--muted)] hover:text-blue-500 transition-all"
        >
          <Plus size={14} />
          <span>添加来源</span>
        </button>
      </div>

      {/* 添加来源面板 */}
      {showAdd && (
        <div className="px-3 py-3 border-b border-[var(--border)] bg-blue-50/30 dark:bg-blue-900/10 animate-fade-in">
          {/* 类型选择 */}
          <div className="flex gap-1 mb-3">
            {[
              { type: "file" as const, icon: Upload, label: "文件" },
              { type: "url" as const, icon: Link, label: "网页" },
              { type: "video" as const, icon: Video, label: "视频" },
              { type: "text" as const, icon: Type, label: "文字" },
            ].map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => setAddType(type)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] transition-colors",
                  addType === type
                    ? "bg-blue-500 text-white"
                    : "bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--sidebar-hover)]"
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          {/* 文件上传 */}
          {addType === "file" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,.doc,.docx"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-6 border-2 border-dashed border-[var(--border)] rounded-lg text-center text-xs text-[var(--muted)] hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                {uploading ? "处理中..." : "点击选择文件\nPDF、TXT、MD、CSV"}
              </button>
            </div>
          )}

          {/* URL 输入 */}
          {addType === "url" && (
            <div className="space-y-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleUrlAdd()}
              />
              <button
                onClick={handleUrlAdd}
                disabled={uploading || !urlInput.trim()}
                className="w-full py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
              >
                {uploading ? "获取中..." : "添加网页"}
              </button>
            </div>
          )}

          {/* 视频输入 */}
          {addType === "video" && (
            <div className="space-y-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="粘贴视频链接（抖音/小红书/B站/YouTube）"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleVideoAdd()}
              />
              <p className="text-[10px] text-[var(--muted)]">
                支持: 抖音、小红书、B站、YouTube
              </p>
              <button
                onClick={handleVideoAdd}
                disabled={uploading || !urlInput.trim()}
                className="w-full py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
              >
                {uploading ? "解析中..." : "添加视频"}
              </button>
            </div>
          )}

          {/* 文字输入 */}
          {addType === "text" && (
            <div className="space-y-2">
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="标题"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-400"
              />
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="粘贴或输入文字内容..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-400 resize-none"
              />
              <button
                onClick={handleTextAdd}
                disabled={uploading || !textTitle.trim() || !textContent.trim()}
                className="w-full py-1.5 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
              >
                {uploading ? "添加中..." : "添加文字"}
              </button>
            </div>
          )}

          <button
            onClick={() => setShowAdd(false)}
            className="mt-2 w-full text-center text-[10px] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            取消
          </button>
        </div>
      )}

      {/* 搜索 */}
      {sources.length > 3 && (
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索来源..."
              className="w-full pl-7 pr-3 py-1.5 rounded-md border border-[var(--border)] bg-transparent text-[11px] outline-none focus:border-blue-400"
            />
          </div>
        </div>
      )}

      {/* 来源列表 */}
      <div className="flex-1 overflow-y-auto">
        {loadingSources ? (
          <div className="flex items-center justify-center py-8 text-[var(--muted)] text-xs">
            加载中...
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-[var(--muted)]">
            <FileText size={28} className="mb-2 opacity-30" />
            <p className="text-xs text-center">
              {sources.length === 0 ? "添加来源即可开始使用" : "没有匹配的来源"}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredSources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                expanded={expandedId === source.id}
                onToggleExpand={() => setExpandedId(expandedId === source.id ? null : source.id)}
                onToggleEnabled={() => toggleSource(userId, notebookId, source.id, !source.enabled)}
                onDelete={() => deleteSource(userId, notebookId, source.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceItem({
  source,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onDelete,
}: {
  source: NotebookSource;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}) {
  const Icon = SOURCE_ICONS[source.type] || FileText;

  return (
    <div
      className={cn(
        "rounded-lg border transition-all",
        source.enabled
          ? "border-[var(--border)] bg-[var(--card)]"
          : "border-dashed border-gray-300 dark:border-gray-600 opacity-50"
      )}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-[var(--sidebar-hover)]/50 rounded-lg"
        onClick={onToggleExpand}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={13} className="shrink-0 text-[var(--muted)]" />
        <span className="text-[11px] font-medium truncate flex-1">{source.title}</span>
        <span className="text-[9px] text-[var(--muted)] shrink-0">
          {source.metadata.wordCount > 1000
            ? `${(source.metadata.wordCount / 1000).toFixed(1)}k`
            : source.metadata.wordCount}
          字
        </span>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2 animate-fade-in">
          <p className="text-[10px] text-[var(--muted)] line-clamp-3 mb-2">
            {source.summary}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-[9px] transition-colors",
                source.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800"
              )}
            >
              {source.enabled ? <Eye size={10} /> : <EyeOff size={10} />}
              {source.enabled ? "启用" : "禁用"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={10} />
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
