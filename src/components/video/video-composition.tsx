"use client";

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { VideoScript, VideoScene } from "@/lib/video-script-generator";

// ========== 视频合成主组件 ==========
export interface VideoCompositionProps {
  script: VideoScript;
  ratio: "16:9" | "9:16" | "1:1";
  colorTheme?: "dark" | "light" | "blue" | "gradient";
  showSubtitles?: boolean;
  watermarkText?: string;
  subtitleStyle?: "bottom" | "center";
}

const FPS = 30;

// 估算每个场景的帧数
function getSceneFrames(scene: VideoScene): number {
  return Math.max((scene.duration || 5) * FPS, 3 * FPS);
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  script, ratio, colorTheme = "dark", showSubtitles = true, watermarkText, subtitleStyle = "bottom",
}) => {
  const openingFrames = Math.max(estimateFrames(script.openingNarration), 3 * FPS);
  const closingFrames = Math.max(estimateFrames(script.closingNarration), 3 * FPS);

  let currentFrame = 0;

  // 构建字幕时间轴
  const subtitleTimeline: Array<{ from: number; dur: number; text: string }> = [];
  let sf = 0;
  subtitleTimeline.push({ from: sf, dur: openingFrames, text: script.openingNarration });
  sf += openingFrames;
  for (const scene of script.scenes) {
    const dur = getSceneFrames(scene);
    subtitleTimeline.push({ from: sf, dur, text: scene.narration });
    sf += dur;
  }
  subtitleTimeline.push({ from: sf, dur: closingFrames, text: script.closingNarration });

  return (
    <AbsoluteFill style={{ backgroundColor: getThemeBg(colorTheme) }}>
      {/* 开场 */}
      <Sequence from={currentFrame} durationInFrames={openingFrames}>
        <OpeningSlide
          title={script.videoTitle}
          subtitle={script.openingNarration}
          theme={colorTheme}
        />
      </Sequence>
      {(() => { currentFrame += openingFrames; return null; })()}

      {/* 内容场景 */}
      {script.scenes.map((scene, i) => {
        const frames = getSceneFrames(scene);
        const from = currentFrame;
        currentFrame += frames;
        return (
          <Sequence key={i} from={from} durationInFrames={frames}>
            <ContentSlide
              scene={scene}
              sceneIndex={i}
              totalScenes={script.scenes.length}
              theme={colorTheme}
            />
          </Sequence>
        );
      })}

      {/* 结尾 */}
      <Sequence from={currentFrame} durationInFrames={closingFrames}>
        <ClosingSlide
          text={script.closingNarration}
          title={script.videoTitle}
          theme={colorTheme}
        />
      </Sequence>

      {/* 字幕叠加层 */}
      {showSubtitles && subtitleTimeline.map((st, i) => (
        <Sequence key={`sub-${i}`} from={st.from} durationInFrames={st.dur}>
          <SubtitleOverlay text={st.text} position={subtitleStyle} />
        </Sequence>
      ))}

      {/* 水印 */}
      {watermarkText && <WatermarkOverlay text={watermarkText} />}
    </AbsoluteFill>
  );
};

// ========== 开场页 ==========
const OpeningSlide: React.FC<{ title: string; subtitle: string; theme: string }> = ({
  title,
  subtitle,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });
  const titleY = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });
  const subtitleOpacity = interpolate(frame, [fps * 0.8, fps * 1.3], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "10%",
        background: getThemeGradient(theme),
      }}
    >
      <h1
        style={{
          fontSize: 48,
          fontWeight: 800,
          color: "#fff",
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${interpolate(titleY, [0, 1], [40, 0])}px)`,
          textShadow: "0 4px 20px rgba(0,0,0,0.3)",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontSize: 22,
          color: "rgba(255,255,255,0.85)",
          textAlign: "center",
          marginTop: 30,
          opacity: subtitleOpacity,
          maxWidth: "80%",
          lineHeight: 1.6,
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};

// ========== 内容页 ==========
const ContentSlide: React.FC<{
  scene: VideoScene;
  sceneIndex: number;
  totalScenes: number;
  theme: string;
}> = ({ scene, sceneIndex, totalScenes, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.3], [0, 1], { extrapolateRight: "clamp" });
  const isDark = theme === "dark" || theme === "gradient";

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "8%",
        background: getThemeBg(theme),
      }}
    >
      {/* 进度条 */}
      <div
        style={{
          width: "100%",
          height: 3,
          backgroundColor: "rgba(255,255,255,0.15)",
          borderRadius: 2,
          marginBottom: 30,
        }}
      >
        <div
          style={{
            width: `${((sceneIndex + 1) / totalScenes) * 100}%`,
            height: "100%",
            backgroundColor: getAccentColor(theme),
            borderRadius: 2,
            transition: "width 0.3s",
          }}
        />
      </div>

      {/* 标题 */}
      <h2
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: isDark ? "#fff" : "#1a1a2e",
          opacity: titleOpacity,
          marginBottom: 24,
        }}
      >
        {scene.title}
      </h2>

      {/* 要点列表 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {scene.keyPoints.map((point, i) => {
          const delay = fps * 0.3 + i * fps * 0.3;
          const pointOpacity = interpolate(frame, [delay, delay + fps * 0.3], [0, 1], { extrapolateRight: "clamp" });
          const pointX = interpolate(frame, [delay, delay + fps * 0.3], [30, 0], { extrapolateRight: "clamp" });

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: pointOpacity,
                transform: `translateX(${pointX}px)`,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: getAccentColor(theme),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 24,
                  color: isDark ? "rgba(255,255,255,0.9)" : "#333",
                  lineHeight: 1.5,
                }}
              >
                {point}
              </span>
            </div>
          );
        })}
      </div>

      {/* 页码 */}
      <div
        style={{
          fontSize: 14,
          color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)",
          textAlign: "right",
        }}
      >
        {sceneIndex + 1} / {totalScenes}
      </div>
    </AbsoluteFill>
  );
};

// ========== 结尾页 ==========
const ClosingSlide: React.FC<{ text: string; title: string; theme: string }> = ({
  text,
  title,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "10%",
        background: getThemeGradient(theme),
      }}
    >
      <p
        style={{
          fontSize: 26,
          color: "rgba(255,255,255,0.9)",
          textAlign: "center",
          opacity,
          lineHeight: 1.7,
          maxWidth: "80%",
        }}
      >
        {text}
      </p>
      <div
        style={{
          marginTop: 40,
          fontSize: 16,
          color: "rgba(255,255,255,0.5)",
          opacity,
        }}
      >
        {title} · 感谢观看
      </div>
    </AbsoluteFill>
  );
};

// ========== 字幕叠加层 ==========
const SubtitleOverlay: React.FC<{ text: string; position: "bottom" | "center" }> = ({ text, position }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.2], [0, 1], { extrapolateRight: "clamp" });

  // 逐句显示：按标点符号拆分，每隔几秒切换
  const sentences = text.split(/[，。！？；、,.\n]+/).filter((s) => s.trim());
  const secondsPerSentence = Math.max(text.replace(/[\s\n]/g, "").length / 4 / Math.max(sentences.length, 1), 1.5);
  const currentSentenceIdx = Math.min(
    Math.floor(frame / (secondsPerSentence * fps)),
    sentences.length - 1
  );
  const currentText = sentences[currentSentenceIdx] || "";

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: position === "center" ? "center" : "flex-end",
        justifyContent: "center",
        padding: position === "center" ? "10%" : "5%",
        paddingBottom: position === "bottom" ? "8%" : undefined,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.65)",
          borderRadius: 8,
          padding: "8px 16px",
          maxWidth: width * 0.85,
          opacity,
        }}
      >
        <p
          style={{
            color: "#fff",
            fontSize: 20,
            textAlign: "center",
            lineHeight: 1.5,
            margin: 0,
            letterSpacing: 0.5,
          }}
        >
          {currentText}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ========== 水印叠加层 ==========
const WatermarkOverlay: React.FC<{ text: string }> = ({ text }) => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        padding: "3%",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          color: "rgba(255,255,255,0.3)",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: 1,
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  );
};

// ========== 主题工具函数 ==========
function getThemeBg(theme: string): string {
  switch (theme) {
    case "dark": return "#0f0f1a";
    case "light": return "#f8f9fa";
    case "blue": return "#0a1628";
    case "gradient": return "#1a1a2e";
    default: return "#0f0f1a";
  }
}

function getThemeGradient(theme: string): string {
  switch (theme) {
    case "dark": return "linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)";
    case "light": return "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
    case "blue": return "linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)";
    case "gradient": return "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)";
    default: return "linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 100%)";
  }
}

function getAccentColor(theme: string): string {
  switch (theme) {
    case "dark": return "#667eea";
    case "light": return "#764ba2";
    case "blue": return "#4fc3f7";
    case "gradient": return "#f093fb";
    default: return "#667eea";
  }
}

function estimateFrames(text: string): number {
  const chars = text.replace(/[\s\n]/g, "").length;
  const seconds = Math.max(chars / 4, 2);
  return Math.round(seconds * FPS);
}

// 计算视频总帧数
export function calculateTotalFrames(script: VideoScript): number {
  const openingFrames = Math.max(estimateFrames(script.openingNarration), 3 * FPS);
  const closingFrames = Math.max(estimateFrames(script.closingNarration), 3 * FPS);
  const sceneFrames = script.scenes.reduce((sum, s) => sum + getSceneFrames(s), 0);
  return openingFrames + sceneFrames + closingFrames;
}
