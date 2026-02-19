import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId, NB_PREFIX, NB_STUDIO, collectSourceTexts, callAI } from "@/lib/notebook-utils";

// Studio 成果类型定义
const STUDIO_TYPES: Record<string, { label: string; icon: string; prompt: string }> = {
  guide: {
    label: "学习指南",
    icon: "📋",
    prompt: `基于以下资料，生成一份详细的学习指南。包含：
1. 核心概念总结
2. 学习路径建议（由浅入深）
3. 重点知识点解析
4. 实践建议
请用清晰的 Markdown 格式输出。`,
  },
  faq: {
    label: "常见问题",
    icon: "❓",
    prompt: `基于以下资料，生成 10-15 个常见问题及其详细解答（FAQ）。
问题应覆盖资料中的核心内容，答案要具体、有用。
格式：## Q: 问题 \n答案内容`,
  },
  outline: {
    label: "大纲摘要",
    icon: "📊",
    prompt: `基于以下资料，生成一份结构化的大纲摘要。包含：
1. 主题概述（1-2 段）
2. 核心要点（层级结构）
3. 关键结论
4. 一句话总结
请用 Markdown 大纲格式输出。`,
  },
  timeline: {
    label: "时间线",
    icon: "📅",
    prompt: `基于以下资料，提取并整理出一条时间线。
按时间顺序列出关键事件、发展阶段或里程碑。
如果资料中没有明确的时间信息，则按逻辑发展顺序整理。
格式：## 时间/阶段 \n- 事件描述`,
  },
  concepts: {
    label: "关键概念",
    icon: "🎯",
    prompt: `基于以下资料，提取 10-20 个关键概念/术语。
每个概念包含：
1. **概念名称**
2. 定义/解释（2-3 句话）
3. 在资料中的重要性
按重要程度排序，用 Markdown 格式输出。`,
  },
  briefing: {
    label: "简报文档",
    icon: "📝",
    prompt: `基于以下资料，生成一份简报文档（Briefing Document）。包含：
1. 背景概述
2. 核心发现/观点（3-5 个要点）
3. 数据和证据支持
4. 结论和建议
5. 后续行动项
请用专业简报格式输出，适合快速阅读和决策参考。`,
  },
};

// GET: 获取已生成的 Studio 成果
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const type = req.nextUrl.searchParams.get("type");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    if (type) {
      // 获取单个成果
      const output = await redis.get(`${NB_STUDIO}${notebookId}:${type}`);
      return NextResponse.json({ output: output || null });
    }

    // 获取所有成果
    const pipeline = redis.pipeline();
    for (const t of Object.keys(STUDIO_TYPES)) {
      pipeline.get(`${NB_STUDIO}${notebookId}:${t}`);
    }
    const results = await pipeline.exec();
    const outputs: Record<string, unknown> = {};
    Object.keys(STUDIO_TYPES).forEach((t, i) => {
      if (results[i]) outputs[t] = results[i];
    });

    return NextResponse.json({
      outputs,
      types: Object.entries(STUDIO_TYPES).map(([key, val]) => ({
        key,
        label: val.label,
        icon: val.icon,
        generated: !!outputs[key],
      })),
    });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/studio]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 生成 Studio 成果（非流式，直接返回结果）
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, type } = await req.json();
    if (!userId || !isValidUserId(userId) || !type) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const studioType = STUDIO_TYPES[type];
    if (!studioType) {
      return NextResponse.json({ error: "无效的成果类型" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 验证笔记本存在
    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    // 收集来源文本
    const sourceTexts = await collectSourceTexts(redis, notebookId);
    if (!sourceTexts) {
      return NextResponse.json({ error: "没有可用的来源内容" }, { status: 400 });
    }

    // 调用 AI 生成（自动适配 Gemini / 千问）
    let generatedText: string;
    try {
      generatedText = await callAI({
        systemPrompt: studioType.prompt,
        contents: [
          {
            role: "user",
            parts: [{ text: `以下是知识库的资料内容，请基于这些资料生成${studioType.label}：\n\n${sourceTexts}` }],
          },
        ],
        temperature: 0.7,
        maxOutputTokens: 8192,
      });
    } catch (err) {
      console.error("[Studio AI]", err);
      return NextResponse.json({ error: "AI 生成失败" }, { status: 500 });
    }
    if (!generatedText) generatedText = "生成失败，请重试";

    // 保存生成结果
    const output = {
      type,
      content: generatedText,
      generatedAt: new Date().toISOString(),
    };
    await redis.set(`${NB_STUDIO}${notebookId}:${type}`, output);

    return NextResponse.json({ success: true, output });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/studio]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
