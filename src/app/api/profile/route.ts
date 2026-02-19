import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return _redis;
}

const PROFILE_PREFIX = "profile:";

export interface UserProfile {
  interests: string[];
  customInterests?: string;
  profession?: string;
  researchDirection?: string;
  setupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// GET: 获取用户资料
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    const redis = getRedis();
    const profile = await redis.get<UserProfile>(`${PROFILE_PREFIX}${userId}`);

    return NextResponse.json({
      profile: profile || { interests: [], setupCompleted: false },
    });
  } catch (err) {
    console.error("[GET /api/profile]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 保存用户兴趣和资料，用 AI 生成专家提示词
export async function POST(req: NextRequest) {
  try {
    const { userId, interests, customInterests, profession, researchDirection } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    const allInterests = [...(interests || [])];
    const hasCustom = customInterests && customInterests.trim();
    const hasProfession = profession && profession.trim();

    if (allInterests.length === 0 && !hasCustom && !hasProfession) {
      return NextResponse.json({ error: "请至少填写一项兴趣或职业信息" }, { status: 400 });
    }

    const redis = getRedis();
    const existing = await redis.get<UserProfile>(`${PROFILE_PREFIX}${userId}`);

    const profile: UserProfile = {
      interests: allInterests.slice(0, 10),
      customInterests: hasCustom ? customInterests.trim().slice(0, 200) : undefined,
      profession: hasProfession ? profession.trim().slice(0, 50) : existing?.profession,
      researchDirection: researchDirection?.trim()?.slice(0, 100) || existing?.researchDirection,
      setupCompleted: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await redis.set(`${PROFILE_PREFIX}${userId}`, profile);

    // 先用预设模板生成基础专家
    let recommendedExperts = generateExpertsForInterests(allInterests, profession, researchDirection);

    // 如果用户填写了自定义关键词或职业，调用 AI 生成定制专家
    if (hasCustom || hasProfession) {
      try {
        const aiExperts = await generateExpertsWithAI(
          allInterests,
          customInterests?.trim(),
          profession?.trim(),
          researchDirection?.trim()
        );
        if (aiExperts.length > 0) {
          // AI 生成的专家替换预设专家（去重）
          const existingNames = new Set(recommendedExperts.map(e => e.name));
          for (const expert of aiExperts) {
            if (!existingNames.has(expert.name)) {
              recommendedExperts.push(expert);
              existingNames.add(expert.name);
            }
          }
          // 限制总数
          recommendedExperts = recommendedExperts.slice(0, 6);
        }
      } catch (e) {
        console.warn("[AI expert generation fallback]", e);
        // AI 失败时使用预设专家，不影响流程
      }
    }

    return NextResponse.json({
      success: true,
      profile,
      recommendedExperts,
    });
  } catch (err) {
    console.error("[POST /api/profile]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// ========== 用 AI 大模型生成定制专家 ==========
async function generateExpertsWithAI(
  interests: string[],
  customInterests?: string,
  profession?: string,
  researchDirection?: string,
): Promise<ExpertTemplate[]> {
  // 读取后台设置（模型提供商和 Key）
  const redis = getRedis();
  const settings = await redis.get<{ modelProvider?: string; qwenApiKey?: string }>("system:settings") || {};
  const modelProvider = settings.modelProvider || "gemini";

  // 构建用户画像描述
  const parts: string[] = [];
  if (interests.length > 0) parts.push(`兴趣领域：${interests.join("、")}`);
  if (customInterests) parts.push(`自定义兴趣爱好：${customInterests}`);
  if (profession) parts.push(`职业/专业：${profession}`);
  if (researchDirection) parts.push(`研究/关注方向：${researchDirection}`);
  const userProfile = parts.join("\n");

  const prompt = `你是一个 AI 专家团队生成器。根据用户的兴趣和职业信息，生成 3~5 位专属 AI 专家。

用户信息：
${userProfile}

请严格按以下 JSON 格式返回（不要返回其他内容）：
[
  {
    "name": "专家名称（2-5个字）",
    "icon": "一个合适的 emoji",
    "description": "一句话描述这个专家的能力（15字以内）",
    "systemPrompt": "详细的系统提示词（100-200字），描述这个专家的身份、专业领域、回答风格和特长。要结合用户的具体领域，提示词要非常具体和专业。"
  }
]

要求：
1. 专家要高度贴合用户的实际需求，不要太泛
2. 每个专家的 systemPrompt 必须详细、专业、有针对性
3. 专家之间要有差异化，覆盖用户不同维度的需求
4. 返回纯 JSON 数组，不要 markdown 代码块`;

  let responseText = "";

  if (modelProvider === "qwen" && settings.qwenApiKey) {
    // 通义千问
    const resp = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.qwenApiKey}`,
      },
      body: JSON.stringify({
        model: "qwen-plus",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });
    if (!resp.ok) throw new Error(`Qwen API error: ${resp.status}`);
    const data = await resp.json();
    responseText = data.choices?.[0]?.message?.content || "";
  } else {
    // Gemini（通过 4sapi）
    const apiBase = process.env.AI_API_BASE || process.env.GEMINI_API_BASE || "https://4sapi.com";
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("No API key");

    const resp = await fetch(
      `${apiBase}/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
      }
    );
    if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
    const data = await resp.json();
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  // 解析 AI 返回的 JSON
  // 清理可能的 markdown 代码块标记
  responseText = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const experts: ExpertTemplate[] = JSON.parse(responseText);

  // 验证格式
  return experts
    .filter(e => e.name && e.icon && e.description && e.systemPrompt)
    .slice(0, 5)
    .map(e => ({
      name: e.name.slice(0, 20),
      icon: e.icon.slice(0, 4),
      description: e.description.slice(0, 50),
      systemPrompt: e.systemPrompt.slice(0, 500),
    }));
}

// ========== 兴趣 → 专家映射 ==========
interface ExpertTemplate {
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

const INTEREST_EXPERTS: Record<string, ExpertTemplate[]> = {
  "编程开发": [
    {
      name: "全栈架构师",
      icon: "🏗️",
      description: "系统架构设计、技术选型、代码审查",
      systemPrompt: "你是一位资深全栈架构师，擅长系统设计、技术选型、性能优化和代码审查。请用专业但易懂的方式指导用户。",
    },
    {
      name: "Debug 侦探",
      icon: "🔍",
      description: "快速定位Bug、分析错误日志、排查问题",
      systemPrompt: "你是一位经验丰富的调试专家。当用户遇到Bug时，你会系统性地分析问题，通过提问缩小范围，给出精准的解决方案。",
    },
  ],
  "金融投资": [
    {
      name: "投资分析师",
      icon: "📈",
      description: "市场分析、投资策略、财报解读",
      systemPrompt: "你是一位专业的投资分析师，擅长市场趋势分析、财务报表解读、投资策略建议。请基于数据和逻辑给出分析，始终提醒投资有风险。",
    },
    {
      name: "理财顾问",
      icon: "💰",
      description: "个人理财规划、资产配置、税务优化",
      systemPrompt: "你是一位个人理财规划师，帮助用户制定合理的理财计划、资产配置方案。回答时考虑用户的风险偏好和财务状况。",
    },
  ],
  "医学健康": [
    {
      name: "健康顾问",
      icon: "🩺",
      description: "健康知识科普、症状分析、生活建议",
      systemPrompt: "你是一位健康科普顾问，提供循证医学知识、健康生活建议。始终提醒用户：AI建议不能替代专业医疗诊断，如有不适请及时就医。",
    },
    {
      name: "营养师",
      icon: "🥗",
      description: "饮食搭配、营养分析、健康食谱",
      systemPrompt: "你是一位专业营养师，擅长饮食搭配、营养素分析和健康食谱设计。根据用户需求提供科学的饮食建议。",
    },
  ],
  "法律咨询": [
    {
      name: "法律顾问",
      icon: "⚖️",
      description: "法律条文解读、合同审查、权益分析",
      systemPrompt: "你是一位法律顾问，擅长中国法律法规解读、合同条款分析、法律风险评估。始终提醒用户：AI分析仅供参考，重要法律事务请咨询专业律师。",
    },
  ],
  "教育学习": [
    {
      name: "学习教练",
      icon: "🎯",
      description: "学习方法、考试策略、知识点梳理",
      systemPrompt: "你是一位资深学习教练，擅长制定高效学习计划、考试策略和知识点梳理。用通俗易懂的方式帮助用户掌握知识。",
    },
    {
      name: "论文导师",
      icon: "📝",
      description: "论文选题、结构指导、写作润色",
      systemPrompt: "你是一位学术写作导师，擅长论文选题指导、结构规划、学术写作规范和语言润色。帮助用户提升学术写作能力。",
    },
  ],
  "设计创意": [
    {
      name: "创意总监",
      icon: "🎨",
      description: "设计灵感、配色方案、视觉策略",
      systemPrompt: "你是一位创意总监，擅长视觉设计、品牌策略、用户体验设计。提供有创意且可落地的设计建议。",
    },
    {
      name: "文案大师",
      icon: "✍️",
      description: "广告文案、品牌故事、内容策划",
      systemPrompt: "你是一位资深文案创意人，擅长广告文案、品牌叙事、内容营销策划。用精炼有力的文字打动读者。",
    },
  ],
  "商业创业": [
    {
      name: "商业顾问",
      icon: "🚀",
      description: "商业模式、市场策略、竞品分析",
      systemPrompt: "你是一位商业战略顾问，擅长商业模式设计、市场定位、竞品分析和增长策略。帮助创业者理清商业思路。",
    },
    {
      name: "产品经理",
      icon: "📋",
      description: "需求分析、产品设计、用户研究",
      systemPrompt: "你是一位资深产品经理，擅长用户需求分析、产品功能设计、用户体验优化和数据驱动决策。",
    },
  ],
  "科学研究": [
    {
      name: "科研助手",
      icon: "🔬",
      description: "文献综述、实验设计、数据分析",
      systemPrompt: "你是一位科研助手，擅长文献检索与综述、实验方案设计、数据分析方法推荐。帮助研究者提高科研效率。",
    },
  ],
  "语言学习": [
    {
      name: "外语教练",
      icon: "🗣️",
      description: "口语练习、语法纠正、翻译润色",
      systemPrompt: "你是一位多语言教练，擅长英语、日语等外语教学。通过情景对话、语法讲解、翻译练习帮助用户提升语言能力。",
    },
  ],
  "心理成长": [
    {
      name: "心理咨询师",
      icon: "🧠",
      description: "情绪管理、压力疏导、自我认知",
      systemPrompt: "你是一位温和的心理咨询师，擅长倾听、共情和引导。帮助用户进行情绪管理、压力疏导。始终提醒：如有严重心理问题请寻求专业帮助。",
    },
  ],
  "生活达人": [
    {
      name: "生活管家",
      icon: "🏠",
      description: "家居收纳、旅行规划、生活技巧",
      systemPrompt: "你是一位生活达人，擅长家居收纳、旅行攻略、美食推荐、生活小技巧。让日常生活更有品质和效率。",
    },
  ],
  "自媒体": [
    {
      name: "内容运营官",
      icon: "📱",
      description: "选题策划、爆款标题、涨粉策略",
      systemPrompt: "你是一位自媒体运营专家，擅长各平台内容策划、爆款选题、标题优化、粉丝增长策略。帮助用户打造有影响力的自媒体。",
    },
  ],
};

function generateExpertsForInterests(
  interests: string[],
  profession?: string,
  researchDirection?: string
): ExpertTemplate[] {
  const experts: ExpertTemplate[] = [];
  const seen = new Set<string>();

  for (const interest of interests) {
    const templates = INTEREST_EXPERTS[interest] || [];
    for (const t of templates) {
      if (!seen.has(t.name)) {
        seen.add(t.name);
        experts.push(t);
      }
    }
  }

  // 如果用户填了专业方向，生成一个定制专家
  if (profession) {
    experts.push({
      name: `${profession}专家`,
      icon: "🎓",
      description: `${profession}领域的专业问答和指导`,
      systemPrompt: `你是${profession}领域的资深专家，拥有丰富的理论知识和实践经验。请用专业且易懂的方式回答用户关于${profession}的问题。${researchDirection ? `用户当前的研究方向是：${researchDirection}，请在回答时优先考虑这个方向。` : ""}`,
    });
  }

  return experts;
}
