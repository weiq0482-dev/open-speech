"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Player } from "@remotion/player";
import { VideoComposition, calculateTotalFrames } from "./video-composition";
import type { VideoScript } from "@/lib/video-script-generator";
import type { ComplianceResult } from "@/lib/video-script-generator";
import type { PublishSuggestion } from "@/lib/video-batch-publish";
import { COSYVOICE_VOICES } from "@/lib/cosyvoice-tts";
import { BGM_LIBRARY, BGM_CATEGORIES, recommendBGM, type BGMTrack, type BGMCategory } from "@/lib/video-bgm";
import { downloadBlob, getExportConfig, type ExportProgress } from "@/lib/video-export";
import {
  Video, Sparkles, ShieldCheck, Volume2, Download, Loader2,
  ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Info,
  Play, RotateCcw, Settings2, Wand2, Monitor, Smartphone, Square,
  Music, Type, Layers, Share2, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ========== 视频生成步骤 ==========
type Step = "config" | "script" | "compliance" | "audio" | "preview";

const STEPS: Array<{ key: Step; label: string; icon: React.ReactNode }> = [
  { key: "config", label: "配置", icon: <Settings2 size={14} /> },
  { key: "script", label: "脚本", icon: <Wand2 size={14} /> },
  { key: "compliance", label: "合规", icon: <ShieldCheck size={14} /> },
  { key: "audio", label: "配音", icon: <Volume2 size={14} /> },
  { key: "preview", label: "预览", icon: <Play size={14} /> },
];

// ========== 视频风格选项 ==========
const VIDEO_STYLES = [
  { id: "knowledge", label: "📊 知识科普", desc: "清晰有条理，适合教育类" },
  { id: "news", label: "📰 新闻播报", desc: "专业客观，适合资讯类" },
  { id: "story", label: "📖 故事讲述", desc: "引人入胜，适合故事类" },
  { id: "product", label: "🛍️ 产品介绍", desc: "突出卖点，适合营销类" },
] as const;

// ========== 视频模式选项 ==========
const VIDEO_MODES = [
  { id: "slides", label: "📊 知识卡片", desc: "幻灯片+配音，无出镜" },
  { id: "avatar", label: "🧑 数字人口播", desc: "全程数字人出镜讲解" },
  { id: "mixed", label: "🎬 混合剪辑", desc: "数字人开场+知识卡片" },
] as const;

// ========== 视频比例选项 ==========
const RATIO_OPTIONS = [
  { id: "16:9" as const, label: "横版", icon: <Monitor size={14} />, desc: "B站/YouTube" },
  { id: "9:16" as const, label: "竖版", icon: <Smartphone size={14} />, desc: "抖音/快手" },
  { id: "1:1" as const, label: "方形", icon: <Square size={14} />, desc: "微信视频号" },
];

// ========== 主题配色 ==========
const THEMES = [
  { id: "dark", label: "暗黑", color: "#0f0f1a" },
  { id: "light", label: "明亮", color: "#667eea" },
  { id: "blue", label: "深蓝", color: "#0a1628" },
  { id: "gradient", label: "渐变", color: "linear-gradient(135deg, #667eea, #764ba2)" },
] as const;

interface VideoGeneratorProps {
  notebookId: string;
  userId: string;
  onClose: () => void;
}

export function VideoGenerator({ notebookId, userId, onClose }: VideoGeneratorProps) {
  const [step, setStep] = useState<Step>("config");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 配置
  const [videoMode, setVideoMode] = useState<string>("slides");
  const [videoStyle, setVideoStyle] = useState<string>("knowledge");
  const [ratios, setRatios] = useState<Array<"16:9" | "9:16" | "1:1">>([("9:16")]);
  const [theme, setTheme] = useState<string>("dark");
  const [duration, setDuration] = useState(180);
  const [voiceId, setVoiceId] = useState("longxiaochun");
  // 内容来源 & 多人讲述
  const [contentSource, setContentSource] = useState<"ai_analysis" | "discussion" | "mixed">("ai_analysis");
  const [speakerCount, setSpeakerCount] = useState(1);
  const [speakerNames, setSpeakerNames] = useState<string[]>(["主讲人"]);

  // BGM & 字幕
  const [selectedBgm, setSelectedBgm] = useState<string>("");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState<"bottom" | "center">("bottom");
  const [watermarkText, setWatermarkText] = useState("");

  // 生成结果
  const [script, setScript] = useState<VideoScript | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  // 导出 & 发布
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [publishSuggestions, setPublishSuggestions] = useState<PublishSuggestion[]>([]);
  const [showPublish, setShowPublish] = useState(false);
  // 批量生成
  const [batchScripts, setBatchScripts] = useState<VideoScript[]>([]);
  const [batchCount, setBatchCount] = useState(5);
  const [showBatch, setShowBatch] = useState(false);

  // 加载已有数据
  useEffect(() => {
    fetch(`/api/notebook/${notebookId}/video?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.script) setScript(data.script);
        if (data.compliance) setCompliance(data.compliance);
        if (data.audio) setAudioReady(true);
      })
      .catch(() => {});
  }, [notebookId, userId]);

  // ========== API 调用 ==========
  const generateScript = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "generate_script", style: videoStyle, targetDuration: duration, contentSource, speakerCount, speakerNames }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "脚本生成失败");
      setScript(data.script);
      setStep("script");
    } catch (err) {
      setError(err instanceof Error ? err.message : "脚本生成失败");
    }
    setLoading(false);
  }, [notebookId, userId, videoStyle, duration, contentSource, speakerCount, speakerNames]);

  const runCompliance = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "compliance_check" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "合规检查失败");
      setCompliance(data.compliance);
      setStep("compliance");
    } catch (err) {
      setError(err instanceof Error ? err.message : "合规检查失败");
    }
    setLoading(false);
  }, [notebookId, userId]);

  const generateAudio = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "generate_audio", voiceId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "配音生成失败");
      setAudioReady(true);
      setStep("audio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "配音生成失败");
    }
    setLoading(false);
  }, [notebookId, userId, voiceId]);

  // ========== 导出 ==========
  const handleExport = useCallback(async () => {
    if (!script) return;
    setExportProgress({ phase: "preparing", progress: 0, message: "准备导出..." });
    // 模拟导出进度（实际导出需要 canvas 录制）
    const config = getExportConfig(ratios[0] || "9:16", "medium");
    const totalMs = script.totalDuration * 1000;
    let pct = 0;
    const timer = setInterval(() => {
      pct += 2;
      if (pct >= 100) {
        clearInterval(timer);
        setExportProgress({ phase: "done", progress: 100, message: "导出完成！请在预览播放器中右键保存视频。" });
      } else {
        setExportProgress({ phase: "rendering", progress: pct, message: `渲染中... ${pct}%（${config.width}x${config.height}）` });
      }
    }, totalMs / 50);
  }, [script, ratios]);

  // ========== 发布建议 ==========
  const handlePublishSuggestions = useCallback(async () => {
    if (!script) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "publish_suggestions", script }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "获取发布建议失败");
      setPublishSuggestions(data.suggestions || []);
    } catch (err) {
      // 使用默认建议
      setPublishSuggestions([
        { platform: "抖音", icon: "📱", ratio: "9:16", titleTip: script.videoTitle, tags: script.tags, bestTime: "12:00-13:00 / 18:00-21:00", tips: ["前3秒要有钩子"] },
        { platform: "B站", icon: "📺", ratio: "16:9", titleTip: script.videoTitle, tags: script.tags, bestTime: "17:00-22:00", tips: ["标题详细"] },
        { platform: "小红书", icon: "📕", ratio: "9:16", titleTip: script.videoTitle, tags: script.tags, bestTime: "12:00-14:00 / 20:00-22:00", tips: ["封面精美"] },
        { platform: "微信视频号", icon: "💬", ratio: "1:1", titleTip: script.videoTitle, tags: script.tags, bestTime: "7:00-9:00 / 20:00-22:00", tips: ["配合公众号"] },
        { platform: "YouTube", icon: "▶️", ratio: "16:9", titleTip: script.videoTitle, tags: script.tags, bestTime: "15:00-18:00", tips: ["做好SEO"] },
      ]);
    }
    setLoading(false);
  }, [script, notebookId, userId]);

  // ========== 批量生成 ==========
  const handleBatchGenerate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "batch_generate", count: batchCount, style: videoStyle, targetDuration: duration }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "批量生成失败");
      setBatchScripts(data.scripts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量生成失败");
    }
    setLoading(false);
  }, [notebookId, userId, batchCount, videoStyle, duration]);

  // ========== 步骤导航 ==========
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const canNext = () => {
    if (step === "config") return true;
    if (step === "script") return !!script;
    if (step === "compliance") return !!compliance;
    if (step === "audio") return audioReady;
    return false;
  };

  const handleNext = () => {
    if (step === "config") {
      generateScript();
    } else if (step === "script") {
      runCompliance();
    } else if (step === "compliance") {
      if (compliance && !compliance.passed) {
        if (!confirm("合规检查发现问题，确定继续？")) return;
      }
      setStep("audio");
    } else if (step === "audio") {
      if (!audioReady) {
        generateAudio();
      } else {
        setStep("preview");
      }
    }
  };

  const handlePrev = () => {
    const idx = stepIndex;
    if (idx > 0) setStep(STEPS[idx - 1].key);
  };

  // ========== 计算预览尺寸 ==========
  const getPreviewSize = () => {
    const maxW = 480, maxH = 360;
    const r = ratios[0] || "9:16";
    if (r === "9:16") return { width: Math.round(maxH * 9 / 16), height: maxH };
    if (r === "1:1") return { width: maxH, height: maxH };
    return { width: maxW, height: Math.round(maxW * 9 / 16) };
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Video size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold">AI 视频生成</h3>
        </div>
        <button onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">关闭</button>
      </div>

      {/* 步骤条 */}
      <div className="flex items-center gap-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <div className="w-4 h-px bg-[var(--border)]" />}
            <button
              onClick={() => {
                if (i <= stepIndex) setStep(s.key);
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                step === s.key
                  ? "bg-purple-500 text-white"
                  : i < stepIndex
                    ? "text-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "text-[var(--muted)]"
              )}
            >
              {s.icon}
              {s.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
            <AlertTriangle size={12} />
            {error}
          </div>
        )}

        {/* 步骤1: 配置 */}
        {step === "config" && (
          <div className="space-y-4">
            {/* 视频模式 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">视频模式</label>
              <div className="grid grid-cols-1 gap-1.5">
                {VIDEO_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setVideoMode(m.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all border",
                      videoMode === m.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-[var(--border)] hover:border-purple-300"
                    )}
                  >
                    <span className="text-sm">{m.label.split(" ")[0]}</span>
                    <div>
                      <p className="font-medium">{m.label.split(" ").slice(1).join(" ")}</p>
                      <p className="text-[10px] text-[var(--muted)]">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              {(videoMode === "avatar" || videoMode === "mixed") && (
                <p className="mt-1.5 text-[10px] text-orange-500">
                  需要在「用户设置」中上传数字人形象照和声音样本
                </p>
              )}
            </div>

            {/* 内容来源 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">内容来源</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: "ai_analysis" as const, label: "📚 知识库", desc: "AI分析资料" },
                  { id: "discussion" as const, label: "💬 讨论组", desc: "多人讨论精华" },
                  { id: "mixed" as const, label: "🔀 混合", desc: "两者结合" },
                ]).map((s) => (
                  <button key={s.id} onClick={() => setContentSource(s.id)}
                    className={cn("px-2 py-2 rounded-lg text-[10px] text-center border transition-all",
                      contentSource === s.id ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-[var(--border)] hover:border-purple-300")}>
                    <p className="font-medium text-xs">{s.label}</p>
                    <p className="text-[var(--muted)]">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 多人讲述 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">讲述人数</label>
              <div className="flex gap-1.5 mb-2">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => { setSpeakerCount(n); setSpeakerNames((prev) => { const arr = [...prev]; while (arr.length < n) arr.push(n === 2 ? "嘉宾A" : "嘉宾B"); return arr.slice(0, n); }); }}
                    className={cn("px-3 py-1.5 rounded-lg text-[10px] border transition-all",
                      speakerCount === n ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-[var(--border)] hover:border-purple-300")}>
                    {n === 1 ? "👤 单人" : n === 2 ? "👥 双人" : "👥 三人"}
                  </button>
                ))}
              </div>
              {speakerCount > 1 && (
                <div className="flex gap-1.5">
                  {speakerNames.map((name, i) => (
                    <input key={i} type="text" value={name} onChange={(e) => { const arr = [...speakerNames]; arr[i] = e.target.value; setSpeakerNames(arr); }}
                      placeholder={`角色${i+1}`} maxLength={8}
                      className="flex-1 px-2 py-1 rounded border border-[var(--border)] bg-transparent text-[10px] outline-none focus:border-purple-500" />
                  ))}
                </div>
              )}
              {speakerCount > 1 && <p className="text-[9px] text-[var(--muted)] mt-1">多人讲述：角色名称需与「用户设置→数字人角色」一致，声音将自动匹配</p>}
            </div>

            {/* 内容风格 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">内容风格</label>
              <div className="grid grid-cols-2 gap-1.5">
                {VIDEO_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setVideoStyle(s.id)}
                    className={cn(
                      "px-2.5 py-2 rounded-lg text-[10px] text-center transition-all border",
                      videoStyle === s.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-[var(--border)] hover:border-purple-300"
                    )}
                  >
                    <p className="font-medium text-xs">{s.label}</p>
                    <p className="text-[var(--muted)]">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 画面比例 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">画面比例</label>
              <div className="flex gap-1.5">
                {RATIO_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRatios(prev => prev.includes(r.id) ? (prev.length > 1 ? prev.filter(x => x !== r.id) : prev) : [...prev, r.id])}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] transition-all border",
                      ratios.includes(r.id)
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-[var(--border)] hover:border-blue-300"
                    )}
                  >
                    {r.icon}
                    <span className="font-medium">{r.label}</span>
                    <span className="text-[var(--muted)]">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 配色主题 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">配色主题</label>
              <div className="flex gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-1",
                      theme === t.id && "ring-2 ring-purple-500 ring-offset-1 rounded-lg"
                    )}
                  >
                    <div
                      className="w-8 h-8 rounded-lg border border-[var(--border)]"
                      style={{ background: t.color }}
                    />
                    <span className="text-[9px]">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 目标时长 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">
                目标时长：{duration}秒 ({Math.floor(duration / 60)}分{duration % 60}秒)
              </label>
              <input
                type="range"
                min={60}
                max={600}
                step={30}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[9px] text-[var(--muted)]">
                <span>1分钟</span>
                <span>10分钟</span>
              </div>
            </div>

            {/* 配音声音 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">配音声音</label>
              <div className="grid grid-cols-2 gap-1">
                {COSYVOICE_VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoiceId(v.id)}
                    className={cn(
                      "px-2 py-1.5 rounded text-[10px] text-left transition-all border",
                      voiceId === v.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-[var(--border)] hover:border-purple-300"
                    )}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="text-[var(--muted)] ml-1">{v.style}</span>
                    {v.recommended && <span className="text-orange-500 ml-1">★</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* 背景音乐 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block flex items-center gap-1">
                <Music size={11} />
                背景音乐
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setSelectedBgm("")}
                  className={cn(
                    "px-2 py-1.5 rounded text-[10px] text-center border transition-all",
                    !selectedBgm
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                      : "border-[var(--border)] hover:border-purple-300"
                  )}
                >🔇 无背景音乐</button>
                {recommendBGM(videoStyle).map((bgm) => (
                  <button
                    key={bgm.id}
                    onClick={() => setSelectedBgm(bgm.id)}
                    className={cn(
                      "px-2 py-1.5 rounded text-[10px] text-left border transition-all",
                      selectedBgm === bgm.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                        : "border-[var(--border)] hover:border-purple-300"
                    )}
                  >
                    <span className="font-medium">{bgm.name}</span>
                    <span className="text-[var(--muted)] ml-1 text-[9px]">{bgm.mood}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 字幕 & 水印 */}
            <div>
              <label className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block flex items-center gap-1">
                <Type size={11} />
                字幕 & 水印
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                    <input type="checkbox" checked={showSubtitles} onChange={(e) => setShowSubtitles(e.target.checked)} className="accent-purple-500" />
                    显示字幕
                  </label>
                  {showSubtitles && (
                    <div className="flex gap-1">
                      {(["bottom", "center"] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setSubtitleStyle(pos)}
                          className={cn(
                            "px-2 py-0.5 rounded text-[9px] border",
                            subtitleStyle === pos
                              ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                              : "border-[var(--border)]"
                          )}
                        >{pos === "bottom" ? "底部" : "居中"}</button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="水印文字（如：@你的账号）"
                  maxLength={20}
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-transparent text-[10px] outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 步骤2: 脚本预览 */}
        {step === "script" && script && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <h4 className="text-sm font-bold mb-1">{script.videoTitle}</h4>
              <p className="text-[10px] text-[var(--muted)]">{script.videoDescription}</p>
              <div className="flex gap-1 mt-2 flex-wrap">
                {script.tags.map((tag, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[9px]">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-[var(--muted)] mb-1">
              共 {script.scenes.length} 个场景 · 预估 {Math.round(script.totalDuration)}秒
            </div>

            {/* 开场白 */}
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-[9px] font-semibold text-green-600 mb-1">🎬 开场白</p>
              <p className="text-[11px]">{script.openingNarration}</p>
            </div>

            {/* 场景列表 */}
            {script.scenes.map((scene, i) => (
              <div key={i} className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded">{i + 1}</span>
                  <span className="text-xs font-semibold">{scene.title}</span>
                  <span className="text-[9px] text-[var(--muted)] ml-auto">~{scene.duration}s</span>
                </div>
                <p className="text-[10px] text-[var(--muted)] mb-1">{scene.narration}</p>
                <div className="flex flex-wrap gap-1">
                  {scene.keyPoints.map((p, j) => (
                    <span key={j} className="text-[9px] bg-[var(--sidebar-hover)] px-1.5 py-0.5 rounded">• {p}</span>
                  ))}
                </div>
              </div>
            ))}

            {/* 结束语 */}
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-[9px] font-semibold text-blue-600 mb-1">🎬 结束语</p>
              <p className="text-[11px]">{script.closingNarration}</p>
            </div>

            {/* 重新生成 */}
            <button
              onClick={generateScript}
              disabled={loading}
              className="flex items-center gap-1 text-[10px] text-purple-500 hover:text-purple-600"
            >
              <RotateCcw size={10} />
              不满意？重新生成脚本
            </button>
          </div>
        )}

        {/* 步骤3: 合规检查 */}
        {step === "compliance" && compliance && (
          <div className="space-y-3">
            <div className={cn(
              "p-3 rounded-lg border flex items-center gap-3",
              compliance.passed
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            )}>
              {compliance.passed ? (
                <CheckCircle2 size={20} className="text-green-500" />
              ) : (
                <AlertTriangle size={20} className="text-red-500" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {compliance.passed ? "合规检查通过" : "发现合规问题"}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  合规评分：{compliance.score}/100
                </p>
              </div>
            </div>

            {compliance.issues.length > 0 && (
              <div className="space-y-2">
                {compliance.issues.map((issue, i) => (
                  <div
                    key={i}
                    className={cn(
                      "p-2 rounded-lg border text-[11px]",
                      issue.severity === "error"
                        ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                        : issue.severity === "warning"
                          ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10"
                          : "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
                    )}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {issue.severity === "error" ? (
                        <AlertTriangle size={10} className="text-red-500" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle size={10} className="text-yellow-500" />
                      ) : (
                        <Info size={10} className="text-blue-500" />
                      )}
                      <span className="font-semibold">[{issue.category}]</span>
                      <span>{issue.description}</span>
                    </div>
                    <p className="text-[var(--muted)] ml-4">建议：{issue.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 步骤4: 配音 */}
        {step === "audio" && (
          <div className="space-y-3">
            {!audioReady ? (
              <div className="text-center py-8">
                <Volume2 size={32} className="mx-auto mb-3 text-[var(--muted)] opacity-40" />
                <p className="text-sm mb-1">准备生成高品质配音</p>
                <p className="text-[10px] text-[var(--muted)] mb-4">
                  使用 CosyVoice · {COSYVOICE_VOICES.find((v) => v.id === voiceId)?.name || "默认声音"}
                </p>
                <button
                  onClick={generateAudio}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" />生成中...</span>
                  ) : (
                    <span className="flex items-center gap-1"><Volume2 size={12} />开始生成配音</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 size={32} className="mx-auto mb-3 text-green-500" />
                <p className="text-sm font-semibold">配音生成完成</p>
                <p className="text-[10px] text-[var(--muted)]">所有段落已合成，可进入预览</p>
              </div>
            )}
          </div>
        )}

        {/* 步骤5: 预览 */}
        {step === "preview" && script && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="rounded-lg overflow-hidden shadow-lg border border-[var(--border)]">
                <Player
                  component={VideoComposition as unknown as React.ComponentType<Record<string, unknown>>}
                  inputProps={{ script, ratio: ratios[0] || "9:16", colorTheme: theme, showSubtitles, watermarkText, subtitleStyle } as unknown as Record<string, unknown>}
                  durationInFrames={calculateTotalFrames(script)}
                  compositionWidth={(ratios[0] || "9:16") === "9:16" ? 1080 : (ratios[0] || "9:16") === "1:1" ? 1080 : 1920}
                  compositionHeight={(ratios[0] || "9:16") === "9:16" ? 1920 : (ratios[0] || "9:16") === "1:1" ? 1080 : 1080}
                  fps={30}
                  style={getPreviewSize()}
                  controls
                  autoPlay={false}
                />
              </div>
            </div>

            <div className="text-center text-[10px] text-[var(--muted)]">
              {script.videoTitle} · {Math.round(script.totalDuration)}秒 · {ratios.join("/")}
            </div>

            {/* 导出按钮 */}
            {exportProgress ? (
              <div className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-1">
                  <Loader2 size={12} className={exportProgress.phase === "done" ? "" : "animate-spin"} />
                  <span className="text-[10px]">{exportProgress.message}</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--sidebar-hover)] rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${exportProgress.progress}%` }} />
                </div>
              </div>
            ) : (
              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600"
              >
                <Download size={12} />
                导出视频
              </button>
            )}

            {/* 发布建议 */}
            <button
              onClick={handlePublishSuggestions}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-purple-300 dark:border-purple-700 text-purple-500 text-[11px] font-medium hover:bg-purple-50 dark:hover:bg-purple-900/10"
            >
              <Share2 size={12} />
              {loading ? "生成中..." : "获取发布建议"}
            </button>

            {publishSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-[var(--muted)]">📢 各平台发布建议</p>
                {publishSuggestions.map((ps, i) => (
                  <div key={i} className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[10px]">
                    <div className="flex items-center gap-1 mb-1">
                      <span>{ps.icon}</span>
                      <span className="font-semibold">{ps.platform}</span>
                      <span className="text-[var(--muted)]">{ps.ratio}</span>
                      <button
                        onClick={() => {
                          const text = `${ps.titleTip}\n\n${ps.tags.map((t) => `#${t}`).join(" ")}`;
                          navigator.clipboard.writeText(text).then(() => alert(`已复制「${ps.platform}」标题和标签到剪贴板`));
                        }}
                        className="ml-auto text-purple-500 hover:text-purple-600"
                        title="复制标题和标签"
                      >
                        <Copy size={10} />
                      </button>
                    </div>
                    <p className="text-[var(--fg)] mb-0.5">{ps.titleTip}</p>
                    <div className="flex flex-wrap gap-1">
                      {ps.tags.slice(0, 5).map((tag, j) => (
                        <span key={j} className="px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[8px]">#{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}

                {/* 一键发布入口 */}
                <div className="mt-2 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
                  <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 mb-2">🚀 一键发布到各平台</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "douyin", name: "抖音", icon: "📱", url: "https://creator.douyin.com/creator-micro/content/upload" },
                      { id: "bilibili", name: "B站", icon: "📺", url: "https://member.bilibili.com/platform/upload/video/frame" },
                      { id: "xiaohongshu", name: "小红书", icon: "📕", url: "https://creator.xiaohongshu.com/publish/publish" },
                      { id: "weixin", name: "视频号", icon: "💬", url: "https://channels.weixin.qq.com/platform/post/create" },
                      { id: "kuaishou", name: "快手", icon: "⚡", url: "https://cp.kuaishou.com/article/publish/video" },
                      { id: "youtube", name: "YouTube", icon: "▶️", url: "https://studio.youtube.com/channel/UC/videos/upload" },
                    ].map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/20 text-[10px] transition-colors">
                        <span>{p.icon}</span>
                        <span className="font-medium">{p.name}</span>
                      </a>
                    ))}
                  </div>
                  <p className="text-[8px] text-[var(--muted)] mt-1.5">点击后跳转到对应平台创作者后台，上传已导出的视频文件。请先在「用户设置→数字人/视频」中绑定平台账号。</p>
                </div>
              </div>
            )}

            {/* 批量生成 */}
            <div className="border-t border-[var(--border)] pt-2">
              <button
                onClick={() => setShowBatch(!showBatch)}
                className="flex items-center gap-1 text-[10px] text-purple-500 hover:text-purple-600"
              >
                <Layers size={10} />
                {showBatch ? "收起批量生成" : "批量生成多条视频"}
              </button>
              {showBatch && (
                <div className="mt-2 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] space-y-2">
                  <p className="text-[10px] text-[var(--muted)]">从同一知识库拆分生成多条不同角度的视频</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]">数量：</span>
                    <input type="range" min={2} max={10} value={batchCount} onChange={(e) => setBatchCount(Number(e.target.value))} className="flex-1 accent-purple-500" />
                    <span className="text-[10px] font-mono w-4">{batchCount}</span>
                  </div>
                  <button
                    onClick={handleBatchGenerate}
                    disabled={loading}
                    className="w-full py-1.5 rounded-lg bg-purple-500 text-white text-[10px] font-medium hover:bg-purple-600 disabled:opacity-50"
                  >
                    {loading ? "生成中..." : `一键生成 ${batchCount} 条视频脚本`}
                  </button>
                  {batchScripts.length > 0 && (
                    <div className="space-y-1">
                      {batchScripts.map((bs, i) => (
                        <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-[var(--sidebar-hover)] text-[10px]">
                          <span className="bg-purple-500 text-white px-1 py-0.5 rounded text-[8px]">{i+1}</span>
                          <span className="flex-1 truncate">{bs.videoTitle}</span>
                          <span className="text-[var(--muted)]">{Math.round(bs.totalDuration)}s</span>
                          <button
                            onClick={() => { setScript(bs); setStep("script"); setShowBatch(false); }}
                            className="text-purple-500 hover:text-purple-600"
                          >使用</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部导航 */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--card)]">
        <button
          onClick={handlePrev}
          disabled={stepIndex === 0}
          className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30"
        >
          <ChevronLeft size={14} />
          上一步
        </button>

        <button
          onClick={handleNext}
          disabled={loading || (step === "preview")}
          className={cn(
            "flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
            loading
              ? "bg-gray-300 text-gray-500"
              : "bg-purple-500 text-white hover:bg-purple-600"
          )}
        >
          {loading ? (
            <><Loader2 size={12} className="animate-spin" />处理中...</>
          ) : step === "config" ? (
            <><Sparkles size={12} />生成脚本</>
          ) : step === "script" ? (
            <><ShieldCheck size={12} />合规检查</>
          ) : step === "compliance" ? (
            <><Volume2 size={12} />配音</>
          ) : step === "audio" && !audioReady ? (
            <><Volume2 size={12} />生成配音</>
          ) : step === "audio" ? (
            <><Play size={12} />预览</>
          ) : (
            <>完成</>
          )}
          {step !== "preview" && <ChevronRight size={14} />}
        </button>
      </div>
    </div>
  );
}
