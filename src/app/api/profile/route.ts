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

function isValidUserId(id: string): boolean {
  return /^u_[a-f0-9]{12}_[a-z0-9]+$/.test(id) || /^em_[a-f0-9]{16}$/.test(id);
}

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
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const profile = await redis.get<UserProfile>(`${PROFILE_PREFIX}${userId}`);
    const quota = await redis.get<{ plan?: string }>(`quota:${userId}`);

    return NextResponse.json({
      profile: profile || { interests: [], setupCompleted: false },
      plan: quota?.plan || "free",
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

    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
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

    // 根据兴趣预设知识库分类标签 + 预设知识内容
    try {
      const kbTagsKey = `kb_tags:${userId}`;
      const defaultTags = [...allInterests];
      if (hasCustom) {
        customInterests.split(/[,，、\s]+/).filter((t: string) => t.trim()).forEach((t: string) => {
          if (!defaultTags.includes(t.trim())) defaultTags.push(t.trim());
        });
      }
      if (hasProfession) defaultTags.push(profession.trim());
      defaultTags.push("AI对话", "深度研究");
      await redis.set(kbTagsKey, defaultTags.slice(0, 20));

      // 预设知识库入门内容
      const kbIndexKey = `kb_index:${userId}`;
      const existingCount = await redis.llen(kbIndexKey);
      if (existingCount === 0) {
        await seedKnowledgeBase(redis, userId, allInterests, profession?.trim(), customInterests?.trim());
      }
    } catch {}

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
  const settings = await redis.get<{ modelProvider?: string; qwenApiKey?: string }>("system_settings") || {};
  const modelProvider = settings.modelProvider || "qwen";

  // 构建用户画像描述
  const parts: string[] = [];
  if (interests.length > 0) parts.push(`兴趣领域：${interests.join("、")}`);
  if (customInterests) parts.push(`自定义兴趣爱好：${customInterests}`);
  if (profession) parts.push(`职业/专业：${profession}`);
  if (researchDirection) parts.push(`研究/关注方向：${researchDirection}`);
  const userProfile = parts.join("\n");

  const prompt = `你是一个 AI 专家团队生成器。请根据用户填写的兴趣和职业信息，为用户量身定制 3~5 位 AI 专家。

【用户信息】
${userProfile}

【核心规则 - 必须遵守】
1. 每个专家必须直接对应用户填写的某个具体兴趣/职业关键词，禁止生成"通用助手"、"编码助手"等泛泛而谈的专家
2. 专家名称必须体现具体领域，例如：
   - 用户写"建筑设计" → 应生成"建筑设计师"而非"设计顾问"
   - 用户写"养花" → 应生成"园艺专家"而非"生活达人"
   - 用户写"思想实验" → 应生成"哲学思辨家"而非"学习导师"
3. systemPrompt 必须包含该领域的专业术语和具体场景

请严格按以下 JSON 格式返回（不要返回任何其他内容，不要代码块标记）：
[
  {
    "name": "专家名称（2-5个字，体现具体领域）",
    "icon": "一个贴切的 emoji",
    "description": "一句话说明能力（15字内，要具体）",
    "systemPrompt": "详细的系统提示词（150-250字）。必须包含：①你的专业身份 ②擅长的具体领域和场景 ③回答风格 ④会用到的专业知识举例。提示词要非常具体，像真正的行业专家一样。"
  }
]`;

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

// ========== 知识库预设内容 ==========
const INTEREST_KB_SEEDS: Record<string, Array<{ title: string; content: string; tags: string[] }>> = {
  "编程开发": [
    { title: "高效编程的 10 个习惯", content: "1. 先想清楚再写代码，用伪代码理清逻辑\n2. 写有意义的变量和函数命名\n3. 小步提交，频繁 commit\n4. 写代码的同时写注释和文档\n5. 学会使用调试工具而非 print 大法\n6. 代码复审（Code Review）是最好的学习方式\n7. 重构是持续的，不要等到「以后」\n8. 善用 AI 辅助编程，但要理解生成的代码\n9. 保持学习新技术的习惯\n10. 休息好才能写出好代码", tags: ["编程开发", "效率"] },
    { title: "2025 热门技术栈速查", content: "前端：React/Next.js、Vue 3、TailwindCSS、TypeScript\n后端：Node.js、Python FastAPI、Go、Rust\nAI/ML：PyTorch、LangChain、Hugging Face、OpenAI API\n数据库：PostgreSQL、Redis、MongoDB、Supabase\n部署：Vercel、Docker、Kubernetes、Cloudflare Workers\n移动端：React Native、Flutter、Swift UI", tags: ["编程开发", "技术栈"] },
  ],
  "AI人工智能": [
    { title: "AI 核心概念速览", content: "大语言模型（LLM）：通过海量文本训练的神经网络，能理解和生成自然语言\nRAG（检索增强生成）：结合知识库检索来增强 AI 回答的准确性\nPrompt Engineering：通过精心设计提示词来引导 AI 产出高质量回答\nFine-tuning：在预训练模型基础上用特定数据进一步训练\nAgent：能自主使用工具、规划步骤来完成复杂任务的 AI 系统\nMultimodal：能同时处理文本、图片、音频、视频的 AI 模型", tags: ["AI人工智能", "概念"] },
    { title: "常用 AI 工具推荐", content: "对话助手：ChatGPT、Claude、Gemini\n代码助手：GitHub Copilot、Cursor、Windsurf\n图片生成：Midjourney、DALL-E 3、Stable Diffusion\n视频生成：Sora、Runway、Pika\n音乐生成：Suno、Udio\n文档处理：NotebookLM、Perplexity\n开发框架：LangChain、LlamaIndex、Dify", tags: ["AI人工智能", "工具"] },
  ],
  "设计艺术": [
    { title: "设计原则四要素", content: "1. 对比（Contrast）：通过大小、颜色、形状的差异创造视觉层次\n2. 重复（Repetition）：统一的视觉元素贯穿整个设计，建立一致性\n3. 对齐（Alignment）：每个元素都应与其他元素有视觉连接\n4. 亲密性（Proximity）：相关的元素放在一起，建立逻辑分组\n\n——出自 Robin Williams《写给大家看的设计书》", tags: ["设计艺术", "原则"] },
  ],
  "商业创业": [
    { title: "商业模式画布九要素", content: "1. 客户细分：你服务谁？\n2. 价值主张：你为客户解决什么问题？\n3. 渠道通路：如何触达客户？\n4. 客户关系：如何维护客户关系？\n5. 收入来源：如何赚钱？\n6. 核心资源：需要哪些关键资源？\n7. 关键业务：最重要的事情是什么？\n8. 重要伙伴：谁是你的合作伙伴？\n9. 成本结构：主要成本有哪些？\n\n——Alexander Osterwalder《商业模式新生代》", tags: ["商业创业", "框架"] },
  ],
  "科学研究": [
    { title: "科研论文写作框架", content: "IMRaD 结构：\n- Introduction（引言）：为什么做？研究背景、问题、目的\n- Methods（方法）：怎么做？实验设计、数据采集\n- Results（结果）：发现了什么？数据展示、统计分析\n- Discussion（讨论）：意味着什么？结果解释、局限性、未来方向\n\n写作顺序建议：Methods → Results → Introduction → Discussion → Abstract", tags: ["科学研究", "写作"] },
  ],
  "自媒体": [
    { title: "爆款内容公式", content: "标题公式：数字 + 痛点/好奇 + 解决方案\n例：「3个方法让你的视频播放量翻10倍」\n\n内容结构：Hook（3秒抓注意力）→ 痛点共鸣 → 干货价值 → 行动号召\n\n平台特点：\n- 抖音/快手：15-60秒竖屏，前3秒决定生死\n- 小红书：精美图片+实用笔记，标题要有关键词\n- B站：深度内容，前30秒要有吸引力\n- 公众号：深度长文，标题决定打开率", tags: ["自媒体", "运营"] },
  ],
  "语言学习": [
    { title: "语言学习高效方法", content: "1. 沉浸式输入：每天听/看目标语言内容 30 分钟\n2. 间隔重复（Spaced Repetition）：用 Anki 等工具科学记忆单词\n3. 影子跟读（Shadowing）：跟着母语者同步朗读，提升口语\n4. 主动输出：每天写日记或找语伴对话\n5. 语境学习：不要孤立背单词，在句子和场景中记忆\n6. 设定微目标：每天 20 个新词 + 复习 50 个旧词", tags: ["语言学习", "方法"] },
  ],
  "心理成长": [
    { title: "情绪管理工具箱", content: "认知重构：识别负面自动思维 → 质疑它的证据 → 替换为更平衡的想法\n\n正念练习：关注当下呼吸，不评判地观察自己的想法和情绪\n\n情绪日记：记录触发事件 → 当时的想法 → 产生的情绪 → 行为反应\n\n5-4-3-2-1 接地技术：看到5个东西、触摸4个东西、听到3个声音、闻到2个气味、尝到1个味道\n\n重要提醒：如有持续的心理困扰，请寻求专业心理咨询帮助", tags: ["心理成长", "工具"] },
  ],
  "写作创作": [
    { title: "写作提升核心技巧", content: "1. 每天写：不管好坏，保持写作习惯\n2. 先写后改：初稿不要追求完美，修改才是核心\n3. 读优秀作品：模仿是学习的开始\n4. 金句积累：随时记录灵感和好句子\n5. 结构先行：写长文前先列大纲\n6. 删减冗余：好文章是改出来的，能删则删\n7. 让别人读：旁观者清，反馈很重要", tags: ["写作创作", "技巧"] },
  ],
  "生活达人": [
    { title: "高效生活管理清单", content: "时间管理：\n- 番茄工作法：25分钟专注 + 5分钟休息\n- 每日三件事：确定今天最重要的3件事\n\n家居收纳：\n- 断舍离原则：1年没用的东西就处理掉\n- 一进一出：买一件新的就处理一件旧的\n\n健康习惯：\n- 7-8小时睡眠\n- 每天喝够2L水\n- 每周至少3次运动，每次30分钟", tags: ["生活达人", "效率"] },
  ],
};

async function seedKnowledgeBase(
  redis: Redis,
  userId: string,
  interests: string[],
  profession?: string,
  customInterests?: string
) {
  const KB_PREFIX = "kb:";
  const KB_INDEX = "kb_index:";
  const indexKey = `${KB_INDEX}${userId}`;
  const items: Array<{ title: string; content: string; tags: string[] }> = [];

  // 根据兴趣收集预设内容
  for (const interest of interests) {
    const seeds = INTEREST_KB_SEEDS[interest];
    if (seeds) items.push(...seeds);
  }

  // 如果有职业，添加一条职业相关的通用知识
  if (profession) {
    items.push({
      title: `${profession} - 我的职业方向`,
      content: `我的职业/专业方向是${profession}。这是我的核心领域，相关的学习资料和工作经验会持续积累在知识库中。\n\n可以通过「深度研究」功能探索最新行业动态，研究成果会自动保存到知识库。`,
      tags: [profession, "职业"],
    });
  }

  // 如果有自定义兴趣，添加一条自定义标签的知识
  if (customInterests) {
    items.push({
      title: `我的特别关注：${customInterests.slice(0, 30)}`,
      content: `自定义关注领域：${customInterests}\n\n这些是我特别感兴趣的方向，可以通过 AI 对话和深度研究来不断积累相关知识。`,
      tags: customInterests.split(/[,，、\s]+/).filter(Boolean).slice(0, 5),
    });
  }

  // 限制最多预设 10 条
  const toSeed = items.slice(0, 10);

  for (const item of toSeed) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const kbItem = {
      id,
      title: item.title,
      content: item.content,
      summary: item.content.slice(0, 200),
      source: "preset" as const,
      tags: item.tags,
      savedAt: new Date().toISOString(),
    };
    await redis.set(`${KB_PREFIX}${userId}:${id}`, kbItem);
    await redis.lpush(indexKey, id);
  }
}
