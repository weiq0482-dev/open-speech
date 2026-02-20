"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { InterestIcon, AppLogo } from "@/components/app-icons";
import { cn } from "@/lib/utils";

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

interface ExpertTemplate {
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

export function InterestSetup({
  userId,
  onComplete,
  onSkip,
}: {
  userId: string;
  onComplete: (experts: ExpertTemplate[]) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterests, setCustomInterests] = useState("");
  const [profession, setProfession] = useState("");
  const [researchDirection, setResearchDirection] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : prev.length < 5
        ? [...prev, id]
        : prev
    );
  };

  const hasInput = selectedInterests.length > 0 || customInterests.trim().length > 0;

  const handleNext = () => {
    if (!hasInput) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!hasInput && !profession.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          interests: selectedInterests,
          customInterests: customInterests.trim() || undefined,
          profession: profession.trim() || undefined,
          researchDirection: researchDirection.trim() || undefined,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        onComplete(data.recommendedExperts || []);
      }
    } catch {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--card)] rounded-2xl w-full max-w-lg shadow-xl animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={onSkip}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)]"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <AppLogo size={22} />
            <h2 className="text-lg font-bold">
              {step === 1 ? "告诉我们你的兴趣" : "补充个人信息"}
            </h2>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {step === 1
              ? "选择标签或自由填写，AI 会为你量身打造专属专家团队"
              : "填写越详细，专家越精准（AI 自动生成提示词）"}
          </p>
          {/* 步骤指示器 */}
          <div className="flex gap-1.5 mt-3">
            <div className={cn("h-1 rounded-full flex-1 transition-colors", step >= 1 ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700")} />
            <div className={cn("h-1 rounded-full flex-1 transition-colors", step >= 2 ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700")} />
          </div>
        </div>

        {/* Step 1: 兴趣选择 + 自由填写 */}
        {step === 1 && (
          <div className="px-6 pb-6">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {INTEREST_OPTIONS.map((opt) => {
                const isSelected = selectedInterests.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleInterest(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 transition-all",
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 scale-[1.02]"
                        : "border-[var(--border)] hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                    )}
                  >
                    <InterestIcon id={opt.id} size={22} className={isSelected ? "text-blue-600 dark:text-blue-300" : "text-[var(--muted)]"} />
                    <span className="text-[11px] font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 自由填写兴趣关键词 */}
            <div className="mb-3">
              <label className="text-xs text-[var(--muted)] mb-1.5 block">
                ✏️ 自由填写你的兴趣爱好（用逗号分隔）
              </label>
              <textarea
                value={customInterests}
                onChange={(e) => setCustomInterests(e.target.value)}
                placeholder="如：摄影后期、宠物养护、电商运营、短视频剪辑、游戏策划、烘焙..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {(selectedInterests.length > 0 || customInterests.trim()) && (
              <div className="text-xs text-[var(--muted)] mb-3">
                {selectedInterests.length > 0 && (
                  <span>
                    已选标签：{selectedInterests.map((id) => {
                      const opt = INTEREST_OPTIONS.find((o) => o.id === id);
                      return opt ? `${opt.icon}${opt.label}` : "";
                    }).join("、")}
                  </span>
                )}
                {customInterests.trim() && (
                  <span>{selectedInterests.length > 0 ? " · " : ""}自定义：{customInterests.trim()}</span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onSkip}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                跳过
              </button>
              <button
                onClick={handleNext}
                disabled={!hasInput}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-white text-sm transition-colors",
                  hasInput
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-300 cursor-not-allowed"
                )}
              >
                下一步 <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 职业 + 研究方向 */}
        {step === 2 && (
          <div className="px-6 pb-6 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">
                你的职业/专业
              </label>
              <input
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="如：前端开发、产品经理、大学教师、外贸业务员..."
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">
                关注/研究方向
              </label>
              <input
                type="text"
                value={researchDirection}
                onChange={(e) => setResearchDirection(e.target.value)}
                placeholder="如：用户增长、机器学习、跨境电商、新能源汽车..."
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 AI 会根据你填写的所有信息，自动生成 3~5 位专属专家，每位专家都有定制的专业提示词。
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                <ChevronLeft size={14} /> 上一步
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> AI 正在生成专家...
                  </>
                ) : (
                  <>
                    <AppLogo size={14} /> 生成我的专家团队
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
