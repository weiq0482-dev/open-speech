"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { X, User, Heart, Loader2, Check, Video, Upload, Mic, Volume2 } from "lucide-react";
import { InterestIcon } from "@/components/app-icons";
import {
  People,
  Avatar,
  Boy,
  BoyOne,
  Girl,
  GirlOne,
  GrinningFace,
  FaceWithSmilingOpenEyes,
  EveryUser,
  AddUser,
  DataUser,
} from "@icon-park/react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

// 头像图标映射
const AVATAR_ICONS: Record<string, ComponentType<any>> = {
  people: People,
  avatar: Avatar,
  boy: Boy,
  boyOne: BoyOne,
  girl: Girl,
  girlOne: GirlOne,
  grinning: GrinningFace,
  smiling: FaceWithSmilingOpenEyes,
  everyUser: EveryUser,
  addUser: AddUser,
  dataUser: DataUser,
};

const AVATAR_OPTIONS = Object.keys(AVATAR_ICONS);

const INTEREST_OPTIONS = [
  { id: "编程开发", icon: "💻", label: "编程开发" },
  { id: "金融投资", icon: "📈", label: "金融投资" },
  { id: "医学健康", icon: "🩺", label: "医学健康" },
  { id: "法律咨询", icon: "⚖️", label: "法律咨询" },
  { id: "教育学习", icon: "📚", label: "教育学习" },
  { id: "设计创意", icon: "🎨", label: "设计创意" },
  { id: "商业创业", icon: "🚀", label: "商业创业" },
  { id: "科学研究", icon: "🔬", label: "科学研究" },
  { id: "语言学习", icon: "🗣️", label: "语言学习" },
  { id: "心理成长", icon: "🧠", label: "心理成长" },
  { id: "生活达人", icon: "🏠", label: "生活达人" },
  { id: "自媒体", icon: "📱", label: "自媒体" },
];


export function UserSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    userId,
    userName,
    userInterests,
    userProfession,
    userAvatar,
    setUserProfile,
  } = useChatStore();

  const [localName, setLocalName] = useState(userName || "");
  const [localInterests, setLocalInterests] = useState<string[]>(userInterests || []);
  const [localProfession, setLocalProfession] = useState(userProfession || "");
  const [localAvatar, setLocalAvatar] = useState(userAvatar || "people");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profile" | "interests" | "video">("profile");

  // 视频/数字人设置
  const [videoSettings, setVideoSettings] = useState({
    voiceId: "longxiaochun",
    voiceSpeed: 1.0,
    cloneVoiceUrl: "",
    voiceSampleUploaded: false,
    avatarPhotoUrl: "",
    avatarStyle: "formal" as "formal" | "casual" | "cartoon",
    watermarkText: "",
    openingTemplate: "",
    closingTemplate: "",
    defaultRatio: "9:16" as "16:9" | "9:16" | "1:1",
    defaultTheme: "dark",
    defaultStyle: "knowledge",
  });
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [avatarPhotoFile, setAvatarPhotoFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  useEffect(() => {
    if (open) {
      setLocalName(userName || "");
      setLocalInterests(userInterests || []);
      setLocalProfession(userProfession || "");
      setLocalAvatar(userAvatar || "people");
      setSaved(false);
      // 加载视频设置
      if (userId) {
        fetch(`/api/video-settings?userId=${userId}`)
          .then((r) => r.json())
          .then((data) => { if (data.settings) setVideoSettings(data.settings); })
          .catch(() => {});
      }
    }
  }, [open, userName, userInterests, userProfession, userAvatar, userId]);


  const toggleInterest = (id: string) => {
    setLocalInterests((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : prev.length < 5
        ? [...prev, id]
        : prev
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setUserProfile({
        userName: localName.trim(),
        userInterests: localInterests,
        userProfession: localProfession.trim(),
        userAvatar: localAvatar,
      });

      // 同步到后端
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          userName: localName.trim(),
          interests: localInterests,
          profession: localProfession.trim(),
          avatar: localAvatar,
        }),
      });

      // 保存视频设置
      await fetch("/api/video-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...videoSettings }),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--card)] rounded-2xl w-full max-w-2xl shadow-xl animate-fade-in overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-lg font-bold">个人设置</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs - 移除知识库管理，因为主页面已有 */}
        <div className="flex border-b border-[var(--border)] px-5 shrink-0">
          {[
            { key: "profile" as const, icon: User, label: "基本信息" },
            { key: "interests" as const, icon: Heart, label: "兴趣爱好" },
            { key: "video" as const, icon: Video, label: "数字人/视频" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors",
                tab === key
                  ? "border-blue-500 text-blue-500"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Profile Tab */}
          {tab === "profile" && (
            <div className="space-y-4">
              {/* Avatar - 使用黑白图标 */}
              <div>
                <label className="text-xs text-[var(--muted)] mb-2 block">头像</label>
                <div className="flex flex-wrap gap-3">
                  {AVATAR_OPTIONS.map((avatarKey) => {
                    const IconComp = AVATAR_ICONS[avatarKey];
                    return (
                      <button
                        key={avatarKey}
                        onClick={() => setLocalAvatar(avatarKey)}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                          localAvatar === avatarKey
                            ? "bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500"
                            : "bg-[var(--sidebar-hover)] hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        )}
                      >
                        <IconComp size={24} theme="outline" strokeWidth={3} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-[var(--muted)] mb-1.5 block">
                  用户名（用于知识库讨论组身份显示）
                </label>
                <input
                  type="text"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  placeholder="输入你的昵称..."
                  maxLength={20}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* Profession */}
              <div>
                <label className="text-xs text-[var(--muted)] mb-1.5 block">职业/专业</label>
                <input
                  type="text"
                  value={localProfession}
                  onChange={(e) => setLocalProfession(e.target.value)}
                  placeholder="如：前端开发、产品经理、大学教师..."
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Interests Tab */}
          {tab === "interests" && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--muted)]">
                选择你的兴趣领域（最多5个），用于推荐专家和知识库类型
              </p>
              <div className="grid grid-cols-3 gap-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const isSelected = localInterests.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleInterest(opt.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 transition-all",
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                          : "border-[var(--border)] hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                      )}
                    >
                      <InterestIcon id={opt.id} size={22} className={isSelected ? "text-blue-600 dark:text-blue-300" : "text-[var(--muted)]"} />
                      <span className="text-[11px] font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {localInterests.length > 0 && (
                <p className="text-xs text-[var(--muted)]">
                  已选择：{localInterests.join("、")}
                </p>
              )}
            </div>
          )}

          {/* Video/Digital Human Tab */}
          {tab === "video" && (
            <div className="space-y-5">
              {/* 数字人形象照 */}
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-2 block flex items-center gap-1">
                  <Upload size={12} />
                  数字人形象照
                </label>
                <p className="text-[10px] text-[var(--muted)] mb-2">
                  上传一张正面免冠照，用于生成数字人视频形象（建议512x512以上）
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-[var(--border)] flex items-center justify-center overflow-hidden bg-[var(--sidebar-hover)]">
                    {avatarPreview || videoSettings.avatarPhotoUrl ? (
                      <img
                        src={avatarPreview || videoSettings.avatarPhotoUrl}
                        alt="avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={24} className="text-[var(--muted)] opacity-40" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-blue-300 cursor-pointer text-xs transition-colors">
                      <Upload size={12} />
                      选择照片
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setAvatarPhotoFile(file);
                            setAvatarPreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                    </label>
                    {avatarPhotoFile && (
                      <p className="text-[10px] text-green-500 mt-1">已选择：{avatarPhotoFile.name}</p>
                    )}
                  </div>
                </div>
                {/* 形象风格 */}
                <div className="flex gap-2 mt-2">
                  {(["formal", "casual", "cartoon"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setVideoSettings((s) => ({ ...s, avatarStyle: style }))}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10px] border transition-colors",
                        videoSettings.avatarStyle === style
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-[var(--border)] hover:border-blue-300"
                      )}
                    >
                      {style === "formal" ? "🤵 正式" : style === "casual" ? "👕 休闲" : "🎭 卡通"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 声音样本 */}
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-2 block flex items-center gap-1">
                  <Mic size={12} />
                  声音克隆（可选）
                </label>
                <p className="text-[10px] text-[var(--muted)] mb-2">
                  上传 3-5 分钟的朗读录音，AI 将克隆你的声音用于视频配音
                </p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-blue-300 cursor-pointer text-xs transition-colors">
                  <Mic size={12} />
                  上传声音样本
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setVoiceSampleFile(file);
                        setVideoSettings((s) => ({ ...s, voiceSampleUploaded: true }));
                      }
                    }}
                  />
                </label>
                {voiceSampleFile && (
                  <p className="text-[10px] text-green-500 mt-1">已选择：{voiceSampleFile.name}</p>
                )}
                {videoSettings.voiceSampleUploaded && !voiceSampleFile && (
                  <p className="text-[10px] text-blue-500 mt-1">已上传声音样本</p>
                )}
              </div>

              {/* 默认配音声音 */}
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-2 block flex items-center gap-1">
                  <Volume2 size={12} />
                  默认配音声音
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "longxiaochun", name: "龙小淳", desc: "温柔知性 ★" },
                    { id: "longlaotie", name: "龙老铁", desc: "成熟稳重 ★" },
                    { id: "longshu", name: "龙叔", desc: "磁性低沉" },
                    { id: "longxiaoxia", name: "龙小夏", desc: "活泼甜美" },
                    { id: "longyue", name: "龙悦", desc: "新闻播报" },
                    { id: "longcheng", name: "龙城", desc: "新闻播报" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVideoSettings((s) => ({ ...s, voiceId: v.id }))}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-[10px] text-left border transition-colors",
                        videoSettings.voiceId === v.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-[var(--border)] hover:border-blue-300"
                      )}
                    >
                      <span className="font-medium">{v.name}</span>
                      <span className="text-[var(--muted)] ml-1">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 语速 */}
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-2 block">
                  语速：{videoSettings.voiceSpeed.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={videoSettings.voiceSpeed}
                  onChange={(e) => setVideoSettings((s) => ({ ...s, voiceSpeed: parseFloat(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-[9px] text-[var(--muted)]">
                  <span>慢 0.5x</span>
                  <span>正常 1.0x</span>
                  <span>快 2.0x</span>
                </div>
              </div>

              {/* 水印 */}
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-1.5 block">视频水印/署名</label>
                <input
                  type="text"
                  value={videoSettings.watermarkText}
                  onChange={(e) => setVideoSettings((s) => ({ ...s, watermarkText: e.target.value }))}
                  placeholder="如：@你的账号名"
                  maxLength={30}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* 开场白/结束语模板 */}
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-1.5 block">默认开场白</label>
                <textarea
                  value={videoSettings.openingTemplate}
                  onChange={(e) => setVideoSettings((s) => ({ ...s, openingTemplate: e.target.value }))}
                  placeholder="如：大家好，我是XXX，今天给大家分享..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--muted)] mb-1.5 block">默认结束语</label>
                <textarea
                  value={videoSettings.closingTemplate}
                  onChange={(e) => setVideoSettings((s) => ({ ...s, closingTemplate: e.target.value }))}
                  placeholder="如：如果觉得有帮助，记得点赞关注哦~"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-transparent text-xs outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
          <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  保存中...
                </>
              ) : saved ? (
                <>
                  <Check size={16} />
                  已保存
                </>
              ) : (
                "保存设置"
              )}
            </button>
          </div>
      </div>
    </div>
  );
}
