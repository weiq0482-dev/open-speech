// ========== AI 视频脚本生成器 ==========
// 从知识库内容生成结构化的视频分镜脚本

import { callAI, collectSourceTexts, getRedis } from "@/lib/notebook-utils";

// 视频分镜结构
export interface VideoScene {
  index: number;
  title: string;        // 本页标题
  narration: string;    // 配音文字
  keyPoints: string[];  // 要点列表
  visualHint: string;   // 画面提示（用于配图）
  duration?: number;    // 估算时长（秒）
}

export interface VideoScript {
  videoTitle: string;           // 视频标题
  videoDescription: string;     // 视频描述/摘要
  tags: string[];               // 推荐标签
  scenes: VideoScene[];         // 分镜列表
  totalDuration: number;        // 总时长估算（秒）
  openingNarration: string;     // 开场白
  closingNarration: string;     // 结束语
}

export type VideoStyle = "knowledge" | "news" | "story" | "product";
export type VideoRatio = "16:9" | "9:16" | "1:1";
export type ContentSource = "ai_analysis" | "discussion" | "mixed";

interface GenerateScriptOptions {
  notebookId: string;
  style?: VideoStyle;
  ratio?: VideoRatio;
  targetDuration?: number; // 目标时长（秒），默认180
  language?: string;
  contentSource?: ContentSource; // 内容来源
  speakerCount?: number;         // 讲述人数（1-3）
  speakerNames?: string[];       // 讲述人名称
}

// 收集讨论组内容
async function collectDiscussionTexts(redis: ReturnType<typeof getRedis>, notebookId: string): Promise<string> {
  try {
    const messages = await redis.lrange(`nb_discuss:${notebookId}`, 0, -1);
    if (!messages || messages.length === 0) return "";
    return messages.map((msg: unknown) => {
      const m = (typeof msg === "string" ? JSON.parse(msg) : msg) as { userName?: string; content?: string };
      return `【${m.userName || "匿名"}】${m.content || ""}`;
    }).join("\n");
  } catch {
    return "";
  }
}

// 生成视频分镜脚本
export async function generateVideoScript(opts: GenerateScriptOptions): Promise<VideoScript> {
  const redis = getRedis();
  const contentSource = opts.contentSource || "ai_analysis";

  // 根据来源收集素材
  let sourceTexts = "";
  let discussTexts = "";

  if (contentSource === "ai_analysis" || contentSource === "mixed") {
    sourceTexts = await collectSourceTexts(redis, opts.notebookId);
  }
  if (contentSource === "discussion" || contentSource === "mixed") {
    discussTexts = await collectDiscussionTexts(redis, opts.notebookId);
  }

  const combinedContent = [sourceTexts, discussTexts].filter(Boolean).join("\n\n---讨论组精华---\n\n");
  if (!combinedContent) throw new Error("没有可用的内容（请添加知识库来源或讨论组内容）");

  const style = opts.style || "knowledge";
  const targetDuration = opts.targetDuration || 180;
  const sceneCount = Math.max(5, Math.round(targetDuration / 20));

  const stylePrompts: Record<VideoStyle, string> = {
    knowledge: "知识科普风格：清晰、有条理、易于理解，适合教育类短视频",
    news: "新闻播报风格：专业、客观、简洁，适合资讯类短视频",
    story: "故事讲述风格：引人入胜、有叙事感、富有情感，适合故事类短视频",
    product: "产品介绍风格：突出卖点、有说服力、结构清晰，适合营销类短视频",
  };

  // 多人讲述提示
  const speakerHint = (opts.speakerCount && opts.speakerCount > 1)
    ? `\n讲述人数：${opts.speakerCount}人（${(opts.speakerNames || []).join("、") || "主讲人、嘉宾"}），每个场景的narration需要标注讲述人，格式为「【人名】台词内容」，多人可以在同一场景对话交替。`
    : "";

  const sourceHint = contentSource === "discussion"
    ? "\n注意：素材来自多人讨论，请提炼讨论中的核心观点和精彩发言，保留讨论的碰撞感。"
    : contentSource === "mixed"
    ? "\n注意：素材包含知识库资料和讨论组内容，请将两者融合，既有知识深度又有讨论活力。"
    : "";

  const prompt = `你是一个专业的短视频编导。基于以下资料，生成一个结构化的视频分镜脚本。

风格要求：${stylePrompts[style]}
目标时长：约${targetDuration}秒
分镜数量：${sceneCount}个场景${speakerHint}${sourceHint}

你必须严格按照以下 JSON 格式输出，不要输出其他内容：
{
  "videoTitle": "视频标题（吸引人，15字以内）",
  "videoDescription": "视频简介（50字以内）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "openingNarration": "开场白配音文字（自然口语化，2-3句话）",
  "closingNarration": "结束语配音文字（引导关注，1-2句话）",
  "scenes": [
    {
      "index": 0,
      "title": "本页大标题（6字以内）",
      "narration": "这一页的配音文字（口语化，自然流畅，30-60字）",
      "keyPoints": ["要点1", "要点2", "要点3"],
      "visualHint": "画面描述（用于AI配图，简短）"
    }
  ]
}

要求：
1. 配音文字必须口语化、自然，像真人在讲话
2. 每个场景的配音约20-30秒（80-120字）
3. 要点简洁，每条不超过15字
4. 开场要有吸引力（钩子），结尾引导互动
5. 全部使用中文`;

  const aiResult = await callAI({
    systemPrompt: prompt,
    contents: [{
      role: "user",
      parts: [{ text: `以下是素材内容，请生成视频分镜脚本：\n\n${combinedContent.slice(0, 50000)}` }],
    }],
    temperature: 0.8,
    maxOutputTokens: 8192,
  });

  // 解析 JSON
  let script: VideoScript;
  try {
    // 提取 JSON（AI 可能在 JSON 前后加了文字或代码块标记）
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 未返回有效 JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    script = {
      videoTitle: parsed.videoTitle || "未命名视频",
      videoDescription: parsed.videoDescription || "",
      tags: parsed.tags || [],
      openingNarration: parsed.openingNarration || "",
      closingNarration: parsed.closingNarration || "",
      scenes: (parsed.scenes || []).map((s: Record<string, unknown>, i: number) => ({
        index: i,
        title: (s.title as string) || `场景${i + 1}`,
        narration: (s.narration as string) || "",
        keyPoints: (s.keyPoints as string[]) || [],
        visualHint: (s.visualHint as string) || "",
        duration: estimateDuration((s.narration as string) || ""),
      })),
      totalDuration: 0,
    };

    // 计算总时长
    const openDur = estimateDuration(script.openingNarration);
    const closeDur = estimateDuration(script.closingNarration);
    const sceneDur = script.scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
    script.totalDuration = openDur + sceneDur + closeDur;
  } catch (err) {
    console.error("[VideoScript] JSON parse error:", err, "\nRaw:", aiResult.slice(0, 500));
    throw new Error("视频脚本生成失败，请重试");
  }

  return script;
}

// AI 法务合规性检查
export interface ComplianceResult {
  passed: boolean;
  score: number; // 0-100
  issues: Array<{
    category: string; // 版权/事实/敏感/广告/隐私/平台
    severity: "error" | "warning" | "info";
    description: string;
    suggestion: string;
  }>;
}

export async function checkCompliance(script: VideoScript): Promise<ComplianceResult> {
  const fullText = [
    script.openingNarration,
    ...script.scenes.map((s) => s.narration),
    script.closingNarration,
  ].join("\n");

  const prompt = `你是一个AI法务合规审查专家。请审查以下视频脚本，检查是否存在法律和合规风险。

审查维度：
1. 版权检查：是否引用了受版权保护的内容（歌曲、书籍、商标等）
2. 事实核查：关键数据和结论是否可能有误
3. 敏感内容：是否包含政治敏感、歧视性、暴力、色情内容
4. 广告合规：是否涉及虚假宣传、绝对化用语（"最好"、"第一"等）
5. 隐私保护：是否涉及未授权的个人信息
6. 平台规范：是否可能违反主流短视频平台规范

你必须严格按照以下 JSON 格式输出：
{
  "passed": true/false,
  "score": 0-100,
  "issues": [
    {
      "category": "版权/事实/敏感/广告/隐私/平台",
      "severity": "error/warning/info",
      "description": "具体问题描述",
      "suggestion": "修改建议"
    }
  ]
}

如果没有问题，issues 为空数组，passed 为 true，score 为 100。`;

  const aiResult = await callAI({
    systemPrompt: prompt,
    contents: [{
      role: "user",
      parts: [{ text: `请审查以下视频脚本：\n\n标题：${script.videoTitle}\n\n${fullText}` }],
    }],
    temperature: 0.3,
    maxOutputTokens: 4096,
  });

  try {
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("合规检查返回格式错误");
    return JSON.parse(jsonMatch[0]) as ComplianceResult;
  } catch {
    return { passed: true, score: 80, issues: [{ category: "系统", severity: "info", description: "合规检查解析失败，建议人工复核", suggestion: "请自行检查内容合规性" }] };
  }
}

// 估算文字朗读时长（中文约4字/秒）
function estimateDuration(text: string): number {
  const charCount = text.replace(/[\s\n]/g, "").length;
  return Math.max(Math.round(charCount / 4), 2);
}
