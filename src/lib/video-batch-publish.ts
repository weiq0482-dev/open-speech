// ========== 批量视频生成 + 多平台发布建议 ==========

import { callAI, collectSourceTexts, getRedis } from "@/lib/notebook-utils";
import type { VideoScript } from "@/lib/video-script-generator";

// ========== 批量生成：一个知识库 → 多条视频脚本 ==========
export interface BatchGenerateOptions {
  notebookId: string;
  count: number;        // 生成几条视频（3-10）
  style: string;
  targetDuration: number;
}

export interface BatchResult {
  scripts: VideoScript[];
  suggestions: string;   // AI给出的发布策略
}

export async function batchGenerateScripts(opts: BatchGenerateOptions): Promise<BatchResult> {
  const redis = getRedis();
  const sourceTexts = await collectSourceTexts(redis, opts.notebookId);
  if (!sourceTexts) throw new Error("知识库没有可用的来源内容");

  const count = Math.min(Math.max(opts.count, 2), 10);

  const prompt = `你是一个短视频矩阵运营专家。基于以下资料，拆分成 ${count} 条独立的短视频脚本。

要求：
1. 每条视频聚焦一个独立知识点/主题
2. 每条视频之间内容不重复，但可以互相引用
3. 每条视频的标题都要有吸引力（钩子式标题）
4. 各视频风格统一但角度不同
5. 适合在短视频平台矩阵发布
6. 每条视频目标时长约 ${opts.targetDuration} 秒

输出严格 JSON 格式：
{
  "scripts": [
    {
      "videoTitle": "视频标题",
      "videoDescription": "简介",
      "tags": ["标签1", "标签2"],
      "openingNarration": "开场白",
      "closingNarration": "结束语",
      "scenes": [
        {
          "index": 0,
          "title": "场景标题",
          "narration": "配音文字",
          "keyPoints": ["要点1", "要点2"],
          "visualHint": "画面描述"
        }
      ]
    }
  ],
  "suggestions": "发布策略建议（发布顺序、时间间隔、平台选择等）"
}`;

  const aiResult = await callAI({
    systemPrompt: prompt,
    contents: [{
      role: "user",
      parts: [{ text: `以下是知识库资料，请拆分生成 ${count} 条视频脚本：\n\n${sourceTexts.slice(0, 50000)}` }],
    }],
    temperature: 0.9,
    maxOutputTokens: 16384,
  });

  try {
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 未返回有效 JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    const scripts: VideoScript[] = (parsed.scripts || []).map((s: Record<string, unknown>) => ({
      videoTitle: (s.videoTitle as string) || "未命名视频",
      videoDescription: (s.videoDescription as string) || "",
      tags: (s.tags as string[]) || [],
      openingNarration: (s.openingNarration as string) || "",
      closingNarration: (s.closingNarration as string) || "",
      scenes: ((s.scenes as Array<Record<string, unknown>>) || []).map((sc, i) => ({
        index: i,
        title: (sc.title as string) || `场景${i + 1}`,
        narration: (sc.narration as string) || "",
        keyPoints: (sc.keyPoints as string[]) || [],
        visualHint: (sc.visualHint as string) || "",
        duration: Math.max(Math.round(((sc.narration as string) || "").replace(/[\s\n]/g, "").length / 4), 2),
      })),
      totalDuration: 0,
    }));

    // 计算各脚本总时长
    for (const script of scripts) {
      const openDur = Math.max(Math.round(script.openingNarration.replace(/[\s\n]/g, "").length / 4), 2);
      const closeDur = Math.max(Math.round(script.closingNarration.replace(/[\s\n]/g, "").length / 4), 2);
      const sceneDur = script.scenes.reduce((sum, sc) => sum + (sc.duration || 0), 0);
      script.totalDuration = openDur + sceneDur + closeDur;
    }

    return {
      scripts,
      suggestions: (parsed.suggestions as string) || "",
    };
  } catch (err) {
    console.error("[BatchGenerate] parse error:", err);
    throw new Error("批量脚本生成失败，请重试");
  }
}

// ========== 多平台发布建议 ==========
export interface PublishSuggestion {
  platform: string;
  icon: string;
  ratio: "16:9" | "9:16" | "1:1";
  titleTip: string;
  tags: string[];
  bestTime: string;
  tips: string[];
}

export async function generatePublishSuggestions(script: VideoScript): Promise<PublishSuggestion[]> {
  const prompt = `你是一个短视频运营专家。分析以下视频脚本，为各平台生成发布建议。

输出严格 JSON 格式，为每个平台提供建议：
[
  {
    "platform": "平台名称",
    "icon": "平台emoji图标",
    "ratio": "推荐比例 16:9/9:16/1:1",
    "titleTip": "适合该平台的标题（重新改写，符合平台调性）",
    "tags": ["推荐标签1", "推荐标签2", ...],
    "bestTime": "最佳发布时间",
    "tips": ["发布技巧1", "发布技巧2"]
  }
]

覆盖平台：抖音、快手、小红书、B站、微信视频号、YouTube`;

  const aiResult = await callAI({
    systemPrompt: prompt,
    contents: [{
      role: "user",
      parts: [{
        text: `视频标题：${script.videoTitle}\n视频简介：${script.videoDescription}\n标签：${script.tags.join("、")}\n开场白：${script.openingNarration}\n内容概要：${script.scenes.map((s) => s.title).join("→")}`,
      }],
    }],
    temperature: 0.7,
    maxOutputTokens: 4096,
  });

  try {
    const jsonMatch = aiResult.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("解析失败");
    return JSON.parse(jsonMatch[0]) as PublishSuggestion[];
  } catch {
    // 返回默认建议
    return [
      { platform: "抖音", icon: "📱", ratio: "9:16", titleTip: script.videoTitle, tags: script.tags, bestTime: "12:00-13:00 / 18:00-21:00", tips: ["前3秒要有钩子", "加热门话题标签"] },
      { platform: "B站", icon: "📺", ratio: "16:9", titleTip: script.videoTitle, tags: script.tags, bestTime: "17:00-22:00", tips: ["标题可以更长更详细", "加入专栏分类"] },
      { platform: "小红书", icon: "📕", ratio: "9:16", titleTip: script.videoTitle, tags: script.tags, bestTime: "12:00-14:00 / 20:00-22:00", tips: ["封面要精美", "多用emoji"] },
      { platform: "微信视频号", icon: "💬", ratio: "1:1", titleTip: script.videoTitle, tags: script.tags, bestTime: "7:00-9:00 / 20:00-22:00", tips: ["配合公众号推文", "标题简洁有力"] },
      { platform: "快手", icon: "⚡", ratio: "9:16", titleTip: script.videoTitle, tags: script.tags, bestTime: "12:00-14:00 / 19:00-22:00", tips: ["内容接地气", "多互动提问"] },
      { platform: "YouTube", icon: "▶️", ratio: "16:9", titleTip: script.videoTitle, tags: script.tags, bestTime: "15:00-18:00 (UTC+8)", tips: ["加英文关键词", "做好SEO描述"] },
    ];
  }
}
