import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateId } from "@/lib/utils";

export type MessageRole = "user" | "assistant";

export interface Attachment {
  id: string;
  name: string;
  type: string; // "image" | "document"
  url: string; // data URL or object URL
  mimeType: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  isStreaming?: boolean;
  toolUsed?: string;
  thinkingContent?: string;
  generatedImages?: string[];
  groundingSources?: { title: string; url: string }[];
  tokenCount?: { input: number; output: number };
}

export interface GenerationConfig {
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number;
  thinkingBudget: number;
}

const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.8,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 16384,
  thinkingBudget: 4096,
};

export interface Gem {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  isBuiltin: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  gemId?: string;
}

export type ToolMode = "none" | "deep-think" | "deep-research" | "image-gen" | "canvas" | "tutor" | "code-assist" | "notebook";

// ========== 预置 Gem ==========
const BUILTIN_GEMS: Gem[] = [
  {
    id: "gem-brainstorm",
    name: "灵感源泉",
    icon: "💡",
    description: "帮助你头脑风暴，激发创意灵感",
    systemPrompt: `你是一个创意顾问和灵感激发器。你的职责是：
1. 帮助用户从不同角度思考问题
2. 提供新颖、有创意的点子和方案
3. 使用头脑风暴技巧（如 SCAMPER、六顶思考帽等）
4. 将抽象想法转化为具体可行的方案
5. 鼓励大胆思考，不设限制
请用富有创意和启发性的方式回答，使用 Markdown 格式。`,
    isBuiltin: true,
  },
  {
    id: "gem-career",
    name: "职业顾问",
    icon: "💼",
    description: "职业规划、简历优化、面试准备",
    systemPrompt: `你是一位资深职业发展顾问。你擅长：
1. 分析职业发展路径和机会
2. 优化简历和求职信
3. 模拟面试并提供反馈
4. 分析行业趋势和薪资水平
5. 制定个人发展计划
请给出专业、务实的建议，使用 Markdown 格式。`,
    isBuiltin: true,
  },
  {
    id: "gem-coding",
    name: "编码助手",
    icon: "👨‍💻",
    description: "代码生成、调试、架构设计",
    systemPrompt: `你是一位高级全栈工程师和技术顾问。你擅长：
1. 编写高质量、可维护的代码
2. 调试和修复复杂 Bug
3. 设计系统架构和数据库方案
4. 代码审查和性能优化
5. 解释技术概念和最佳实践
所有代码使用 Markdown 代码块包裹并标注语言。追求简洁高效。`,
    isBuiltin: true,
  },
  {
    id: "gem-writer",
    name: "写作高手",
    icon: "✍️",
    description: "文章撰写、内容创作、文案优化",
    systemPrompt: `你是一位专业作家和内容策略师。你擅长：
1. 撰写各类文章（公众号、博客、报告、学术论文）
2. 营销文案和广告语创作
3. 故事创作和小说写作
4. 翻译和本地化
5. 内容结构优化和风格调整
请根据用户需求输出高质量内容，使用 Markdown 格式。`,
    isBuiltin: true,
  },
  {
    id: "gem-learning",
    name: "学习导师",
    icon: "📚",
    description: "个性化学习辅导，深入浅出讲解",
    systemPrompt: `你是一位耐心、专业的学习导师。你的教学方法：
1. 从学生已有知识出发，循序渐进
2. 用生活中的例子和类比解释抽象概念
3. 适时提出思考问题引导学生主动思考
4. 针对薄弱环节提供专项练习
5. 总结要点并提供记忆技巧
请用通俗易懂的语言教学，使用 Markdown 格式。`,
    isBuiltin: true,
  },
  {
    id: "gem-translate",
    name: "翻译专家",
    icon: "🌐",
    description: "多语种翻译，保持原文风格和语气",
    systemPrompt: `你是一位精通多语言的资深翻译。你需要：
1. 准确翻译用户提供的文本
2. 保持原文的语气、风格和格式
3. 处理习语、俚语和文化差异
4. 如有歧义，提供多种翻译选项
5. 默认中英互译，支持用户指定其他语种
请直接输出译文，必要时附注说明。使用 Markdown 格式。`,
    isBuiltin: true,
  },
];

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  sidebarOpen: boolean;
  darkMode: boolean;
  activeTool: ToolMode;
  isGenerating: boolean;
  gems: Gem[];
  activeGemId: string | null;
  // AI Studio 设置
  generationConfig: GenerationConfig;
  customSystemInstruction: string;
  settingsPanelOpen: boolean;

  // Actions
  createConversation: (gemId?: string) => string;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, "id" | "timestamp">) => string;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Pick<Message, "content" | "thinkingContent" | "generatedImages" | "groundingSources" | "tokenCount">>) => void;
  setMessageStreaming: (conversationId: string, messageId: string, streaming: boolean) => void;
  updateConversationTitle: (id: string, title: string) => void;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setActiveTool: (tool: ToolMode) => void;
  setIsGenerating: (generating: boolean) => void;
  getActiveConversation: () => Conversation | undefined;
  addGem: (gem: Omit<Gem, "id" | "isBuiltin">) => string;
  deleteGem: (id: string) => void;
  setActiveGem: (id: string | null) => void;
  getGemById: (id: string) => Gem | undefined;
  // AI Studio actions
  setGenerationConfig: (config: Partial<GenerationConfig>) => void;
  setCustomSystemInstruction: (instruction: string) => void;
  toggleSettingsPanel: () => void;
  resetGenerationConfig: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
  conversations: [],
  activeConversationId: null,
  sidebarOpen: true,
  darkMode: false,
  activeTool: "none",
  isGenerating: false,
  gems: [...BUILTIN_GEMS],
  activeGemId: null,
  generationConfig: { ...DEFAULT_CONFIG },
  customSystemInstruction: "",
  settingsPanelOpen: false,

  createConversation: (gemId?: string) => {
    const id = generateId();
    const gem = gemId ? get().gems.find((g) => g.id === gemId) : undefined;
    const conversation: Conversation = {
      id,
      title: gem ? gem.name : "新对话",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      gemId,
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: id,
      activeGemId: gemId || null,
    }));
    return id;
  },

  deleteConversation: (id) => {
    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id);
      const newActiveId =
        state.activeConversationId === id
          ? filtered.length > 0
            ? filtered[0].id
            : null
          : state.activeConversationId;
      return { conversations: filtered, activeConversationId: newActiveId };
    });
  },

  setActiveConversation: (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    set({ activeConversationId: id, activeGemId: conv?.gemId || null });
  },

  addMessage: (conversationId, message) => {
    const messageId = generateId();
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { ...message, id: messageId, timestamp: new Date() },
              ],
              updatedAt: new Date(),
            }
          : c
      ),
    }));
    return messageId;
  },

  updateMessage: (conversationId, messageId, updates) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, ...updates } : m
              ),
            }
          : c
      ),
    }));
  },

  setMessageStreaming: (conversationId, messageId, streaming) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, isStreaming: streaming } : m
              ),
            }
          : c
      ),
    }));
  },

  updateConversationTitle: (id, title) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleDarkMode: () => {
    set((state) => {
      const newDark = !state.darkMode;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", newDark);
      }
      return { darkMode: newDark };
    });
  },

  setActiveTool: (tool) => set((state) => ({ activeTool: state.activeTool === tool ? "none" : tool })),
  setIsGenerating: (generating) => set({ isGenerating: generating }),

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },

  addGem: (gem) => {
    const id = generateId();
    const newGem: Gem = { ...gem, id, isBuiltin: false };
    set((state) => ({ gems: [...state.gems, newGem] }));
    return id;
  },

  deleteGem: (id) => {
    set((state) => ({
      gems: state.gems.filter((g) => g.id !== id || g.isBuiltin),
    }));
  },

  setActiveGem: (id) => set({ activeGemId: id }),

  getGemById: (id) => get().gems.find((g) => g.id === id),

  setGenerationConfig: (config) =>
    set((state) => ({
      generationConfig: { ...state.generationConfig, ...config },
    })),
  setCustomSystemInstruction: (instruction) =>
    set({ customSystemInstruction: instruction }),
  toggleSettingsPanel: () =>
    set((state) => ({ settingsPanelOpen: !state.settingsPanelOpen })),
  resetGenerationConfig: () =>
    set({ generationConfig: { ...DEFAULT_CONFIG }, customSystemInstruction: "" }),
}),
    {
      name: "openspeech-chat-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        conversations: state.conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            isStreaming: false,
            // 保留生成的图片（文本较小），但清理上传附件的 base64 数据以节省空间
            attachments: m.attachments?.map((a) => ({
              ...a,
              url: a.url.length > 50000 ? "[已清理-重新上传]" : a.url,
            })),
          })),
        })),
        activeConversationId: state.activeConversationId,
        sidebarOpen: state.sidebarOpen,
        darkMode: state.darkMode,
        gems: state.gems.filter((g) => !g.isBuiltin),
        activeGemId: state.activeGemId,
        generationConfig: state.generationConfig,
        customSystemInstruction: state.customSystemInstruction,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // 恢复 Date 对象（JSON 序列化后变成字符串）
        state.conversations = state.conversations.map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
          messages: c.messages.map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        }));
        // 合并预置 Gems（防止更新后丢失）
        const savedCustomGems = state.gems.filter((g) => !g.isBuiltin);
        state.gems = [...BUILTIN_GEMS, ...savedCustomGems];
        // 恢复暗色模式
        if (state.darkMode && typeof document !== "undefined") {
          document.documentElement.classList.add("dark");
        }
      },
    }
  )
);
