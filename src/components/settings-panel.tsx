"use client";

import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Sliders } from "lucide-react";

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--foreground)]">{label}</span>
        <span className="text-[var(--muted)] font-mono text-xs tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-gray-200 dark:bg-gray-700
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-gemini-blue
          [&::-webkit-slider-thumb]:shadow-sm
          [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-[var(--muted)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const {
    generationConfig,
    setGenerationConfig,
    customSystemInstruction,
    setCustomSystemInstruction,
    settingsPanelOpen,
    toggleSettingsPanel,
    resetGenerationConfig,
  } = useChatStore();

  if (!settingsPanelOpen) return null;

  return (
    <aside
      className={cn(
        "w-[320px] shrink-0 h-full border-l border-[var(--border)] bg-[var(--sidebar-bg)]",
        "flex flex-col overflow-hidden animate-fade-in"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-gemini-blue" />
          <span className="font-semibold text-sm">运行设置</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetGenerationConfig}
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
            title="重置为默认值"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={toggleSettingsPanel}
            className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--muted)] transition-colors"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* System Instruction */}
        <div className="p-4 border-b border-[var(--border)]">
          <label className="block text-sm font-medium mb-2">系统指令</label>
          <textarea
            value={customSystemInstruction}
            onChange={(e) => setCustomSystemInstruction(e.target.value)}
            placeholder="输入自定义系统指令...&#10;&#10;例如：你是一个专业的数据分析师，请用简洁的语言回答问题。"
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-transparent text-sm outline-none focus:border-gemini-blue resize-none placeholder:text-[var(--muted)]"
            rows={4}
          />
          <p className="text-[10px] text-[var(--muted)] mt-1.5">
            自定义系统指令会覆盖工具的默认指令
          </p>
        </div>

        {/* Generation Config */}
        <div className="p-4 space-y-5">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            生成参数
          </h3>

          <SliderRow
            label="Temperature"
            value={generationConfig.temperature}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => setGenerationConfig({ temperature: v })}
          />

          <SliderRow
            label="Top P"
            value={generationConfig.topP}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setGenerationConfig({ topP: v })}
          />

          <SliderRow
            label="Top K"
            value={generationConfig.topK}
            min={1}
            max={100}
            step={1}
            onChange={(v) => setGenerationConfig({ topK: v })}
          />

          <SliderRow
            label="最大输出 Tokens"
            value={generationConfig.maxOutputTokens}
            min={256}
            max={65536}
            step={256}
            onChange={(v) => setGenerationConfig({ maxOutputTokens: v })}
          />

          <SliderRow
            label="思考预算"
            value={generationConfig.thinkingBudget}
            min={0}
            max={32768}
            step={256}
            onChange={(v) => setGenerationConfig({ thinkingBudget: v })}
          />
        </div>

        {/* Quick presets */}
        <div className="p-4 border-t border-[var(--border)]">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            快捷预设
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                setGenerationConfig({
                  temperature: 0.2,
                  topP: 0.8,
                  topK: 20,
                  maxOutputTokens: 8192,
                })
              }
              className="px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors text-xs text-center"
            >
              🎯 精确模式
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                T=0.2 低随机
              </div>
            </button>
            <button
              onClick={() =>
                setGenerationConfig({
                  temperature: 1.2,
                  topP: 0.95,
                  topK: 60,
                  maxOutputTokens: 8192,
                })
              }
              className="px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors text-xs text-center"
            >
              🎨 创意模式
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                T=1.2 高随机
              </div>
            </button>
            <button
              onClick={() =>
                setGenerationConfig({
                  temperature: 0.3,
                  topP: 0.85,
                  topK: 30,
                  maxOutputTokens: 16384,
                })
              }
              className="px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors text-xs text-center"
            >
              💻 代码模式
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                T=0.3 长输出
              </div>
            </button>
            <button
              onClick={() =>
                setGenerationConfig({
                  temperature: 0.8,
                  topP: 0.95,
                  topK: 40,
                  maxOutputTokens: 65536,
                  thinkingBudget: 32768,
                })
              }
              className="px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--sidebar-hover)] transition-colors text-xs text-center"
            >
              🧠 深度模式
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                最大 Token + 思考
              </div>
            </button>
          </div>
        </div>

        {/* Parameter descriptions */}
        <div className="p-4 border-t border-[var(--border)]">
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            参数说明
          </h3>
          <div className="space-y-2 text-xs text-[var(--muted)]">
            <p>
              <strong className="text-[var(--foreground)]">Temperature</strong>{" "}
              — 控制输出随机性。越低越确定，越高越有创意。
            </p>
            <p>
              <strong className="text-[var(--foreground)]">Top P</strong> —
              核心采样概率。只从概率最高的 P% token 中选择。
            </p>
            <p>
              <strong className="text-[var(--foreground)]">Top K</strong> —
              只从概率最高的 K 个 token 中选择。
            </p>
            <p>
              <strong className="text-[var(--foreground)]">最大输出 Tokens</strong>{" "}
              — 单次回复的最大 token 数量。
            </p>
            <p>
              <strong className="text-[var(--foreground)]">思考预算</strong> —
              Deep Think 模式下模型用于推理的 token 预算。
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
