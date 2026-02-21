import { create } from "zustand";

// ========== Types ==========
export interface Notebook {
  id: string;
  title: string;
  description: string;
  icon: string;
  ownerId: string;
  shareId: string | null;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookSource {
  id: string;
  type: "file" | "url" | "text" | "video" | "knowledge";
  title: string;
  content: string;
  summary: string;
  metadata: {
    fileName?: string;
    fileType?: string;
    url?: string;
    platform?: string;
    author?: string;
    wordCount: number;
  };
  enabled: boolean;
  addedAt: string;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  timestamp: string;
}

export interface StudioOutput {
  type: string;
  content: string;
  generatedAt: string;
}

export interface StudioType {
  key: string;
  label: string;
  icon: string;
  generated: boolean;
}

export interface DiscussMessage {
  id: string;
  userId: string;
  userName: string;
  userIcon: string;
  type: "text" | "image" | "file" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    replyTo?: string;
  };
}

export interface ShareConfig {
  shareId: string;
  notebookId: string;
  ownerId: string;
  access: "public" | "login-required";
  createdAt: string;
}

export interface PodcastSegment {
  speaker: string;
  text: string;
  voice: string;
}

export interface PodcastData {
  mode: "narration" | "dialogue";
  script: string;
  segments: PodcastSegment[];
  voices: Record<string, string>;
  generatedAt: string;
}

// ========== Store ==========
interface NotebookStore {
  // 列表
  notebooks: Notebook[];
  loadingList: boolean;

  // 当前打开的笔记本
  currentNotebook: Notebook | null;
  sources: NotebookSource[];
  chatMessages: ChatMessage[];
  studioOutputs: Record<string, StudioOutput>;
  studioTypes: StudioType[];

  // 讨论组
  discussMessages: DiscussMessage[];
  loadingDiscuss: boolean;

  // 分享
  shareConfig: ShareConfig | null;
  memberCount: number;

  // 播客
  podcastData: PodcastData | null;
  podcastNarration: PodcastData | null;
  podcastDialogue: PodcastData | null;
  generatingPodcast: boolean;

  // UI 状态
  loadingSources: boolean;
  loadingChat: boolean;
  generatingStudio: string | null;
  streamingResponse: string;
  middleTab: "ai" | "discuss";

  // Actions
  fetchNotebooks: (userId: string) => Promise<void>;
  createNotebook: (userId: string, title: string, icon?: string) => Promise<Notebook | null>;
  deleteNotebook: (userId: string, notebookId: string) => Promise<void>;
  openNotebook: (userId: string, notebookId: string) => Promise<void>;
  closeNotebook: () => void;

  // Sources
  fetchSources: (userId: string, notebookId: string) => Promise<void>;
  addSource: (userId: string, notebookId: string, source: { type: string; title: string; content: string; metadata?: Record<string, unknown> }) => Promise<boolean>;
  deleteSource: (userId: string, notebookId: string, sourceId: string) => Promise<void>;
  toggleSource: (userId: string, notebookId: string, sourceId: string, enabled: boolean) => Promise<void>;

  // Chat
  fetchChatHistory: (userId: string, notebookId: string) => Promise<void>;
  sendMessage: (userId: string, notebookId: string, message: string) => Promise<void>;
  clearChatMessages: () => void;

  // Studio
  fetchStudioOutputs: (userId: string, notebookId: string) => Promise<void>;
  generateStudio: (userId: string, notebookId: string, type: string) => Promise<void>;

  // Discussion
  fetchDiscussMessages: (userId: string, notebookId: string) => Promise<void>;
  sendDiscussMessage: (userId: string, notebookId: string, type: string, content: string, metadata?: Record<string, unknown>) => Promise<void>;
  clearDiscussMessages: () => void;

  // Share
  fetchShareInfo: (userId: string, notebookId: string) => Promise<void>;
  createShare: (userId: string, notebookId: string, access?: string) => Promise<string | null>;
  revokeShare: (userId: string, notebookId: string) => Promise<void>;

  // Podcast
  fetchPodcast: (userId: string, notebookId: string) => Promise<void>;
  generatePodcast: (userId: string, notebookId: string, mode: string, voices?: Record<string, string>) => Promise<void>;

  // UI
  setMiddleTab: (tab: "ai" | "discuss") => void;
}

export const useNotebookStore = create<NotebookStore>((set, get) => ({
  notebooks: [],
  loadingList: false,
  currentNotebook: null,
  sources: [],
  chatMessages: [],
  studioOutputs: {},
  studioTypes: [],
  discussMessages: [],
  loadingDiscuss: false,
  shareConfig: null,
  memberCount: 0,
  podcastData: null,
  podcastNarration: null,
  podcastDialogue: null,
  generatingPodcast: false,
  loadingSources: false,
  loadingChat: false,
  generatingStudio: null,
  streamingResponse: "",
  middleTab: "ai",

  // ========== Notebook List ==========
  fetchNotebooks: async (userId) => {
    set({ loadingList: true });
    try {
      const resp = await fetch(`/api/notebook?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ notebooks: data.notebooks || [] });
      }
    } catch {}
    set({ loadingList: false });
  },

  createNotebook: async (userId, title, icon) => {
    try {
      const resp = await fetch("/api/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title, icon }),
      });
      if (resp.ok) {
        const data = await resp.json();
        set((s) => ({ notebooks: [data.notebook, ...s.notebooks] }));
        return data.notebook;
      }
    } catch {}
    return null;
  },

  deleteNotebook: async (userId, notebookId) => {
    try {
      await fetch("/api/notebook", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notebookId }),
      });
      set((s) => ({
        notebooks: s.notebooks.filter((n) => n.id !== notebookId),
        currentNotebook: s.currentNotebook?.id === notebookId ? null : s.currentNotebook,
      }));
    } catch {}
  },

  // ========== Open/Close Notebook ==========
  openNotebook: async (userId, notebookId) => {
    const { fetchSources, fetchChatHistory, fetchStudioOutputs } = get();
    try {
      const resp = await fetch(`/api/notebook/${notebookId}?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ currentNotebook: data.notebook, chatMessages: [], sources: [], studioOutputs: {}, studioTypes: [] });
        // 并行加载来源、对话、成果
        await Promise.all([
          fetchSources(userId, notebookId),
          fetchChatHistory(userId, notebookId),
          fetchStudioOutputs(userId, notebookId),
        ]);
      }
    } catch {}
  },

  closeNotebook: () => {
    set({
      currentNotebook: null,
      sources: [],
      chatMessages: [],
      studioOutputs: {},
      studioTypes: [],
      streamingResponse: "",
      discussMessages: [],
      shareConfig: null,
      memberCount: 0,
      podcastData: null,
    });
  },

  // ========== Sources ==========
  fetchSources: async (userId, notebookId) => {
    set({ loadingSources: true });
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/sources?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ sources: data.sources || [] });
      }
    } catch {}
    set({ loadingSources: false });
  },

  addSource: async (userId, notebookId, source) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...source }),
      });
      if (resp.ok) {
        const data = await resp.json();
        set((s) => ({ sources: [data.source, ...s.sources] }));
        return true;
      }
    } catch {}
    return false;
  },

  deleteSource: async (userId, notebookId, sourceId) => {
    try {
      await fetch(`/api/notebook/${notebookId}/sources`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sourceId }),
      });
      set((s) => ({ sources: s.sources.filter((src) => src.id !== sourceId) }));
    } catch {}
  },

  toggleSource: async (userId, notebookId, sourceId, enabled) => {
    try {
      await fetch(`/api/notebook/${notebookId}/sources`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sourceId, enabled }),
      });
      set((s) => ({
        sources: s.sources.map((src) => (src.id === sourceId ? { ...src, enabled } : src)),
      }));
    } catch {}
  },

  // ========== Chat ==========
  fetchChatHistory: async (userId, notebookId) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/chat?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ chatMessages: data.messages || [] });
      }
    } catch {}
  },

  sendMessage: async (userId, notebookId, message) => {
    const { chatMessages } = get();
    const userMsg: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };
    set({ chatMessages: [...chatMessages, userMsg], loadingChat: true, streamingResponse: "" });

    try {
      const resp = await fetch(`/api/notebook/${notebookId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message, history: chatMessages.slice(-10) }),
      });

      if (!resp.ok || !resp.body) {
        // 额度不足时显示错误提示
        try {
          const errData = await resp.json();
          if (errData.quotaExhausted || resp.status === 429) {
            const errMsg: ChatMessage = { role: "model", content: `⚠️ ${errData.error || "额度不足，请兑换体验卡或购买套餐"}`, timestamp: new Date().toISOString() };
            set((s) => ({ chatMessages: [...s.chatMessages, errMsg] }));
          }
        } catch {}
        set({ loadingChat: false });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              set({ streamingResponse: fullText });
            }
          } catch {}
        }
      }

      if (fullText) {
        const assistantMsg: ChatMessage = { role: "model", content: fullText, timestamp: new Date().toISOString() };
        set((s) => ({
          chatMessages: [...s.chatMessages, assistantMsg],
          streamingResponse: "",
        }));
        // 通知侧边栏刷新配额
        if (typeof window !== "undefined") window.dispatchEvent(new Event("chat-message-sent"));
      }
    } catch {}
    set({ loadingChat: false });
  },

  // ========== Studio ==========
  fetchStudioOutputs: async (userId, notebookId) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/studio?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ studioOutputs: data.outputs || {}, studioTypes: data.types || [] });
      }
    } catch {}
  },

  generateStudio: async (userId, notebookId, type) => {
    set({ generatingStudio: type });
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/studio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type }),
      });
      if (resp.ok) {
        const data = await resp.json();
        set((s) => ({
          studioOutputs: { ...s.studioOutputs, [type]: data.output },
          studioTypes: s.studioTypes.map((t) => (t.key === type ? { ...t, generated: true } : t)),
        }));
        // 通知侧边栏刷新配额
        if (typeof window !== "undefined") window.dispatchEvent(new Event("chat-message-sent"));
      } else {
        try {
          const errData = await resp.json();
          if (resp.status === 429) {
            alert(errData.error || "额度不足，请兑换体验卡或购买套餐");
          } else {
            alert(errData.error || "生成失败，请确认来源内容已启用后重试");
          }
        } catch {
          alert("生成失败，请重试");
        }
      }
    } catch (e) {
      console.error("[generateStudio]", e);
      alert("生成失败，请检查网络后重试");
    }
    set({ generatingStudio: null });
  },

  // ========== Discussion ==========
  fetchDiscussMessages: async (userId, notebookId) => {
    set({ loadingDiscuss: true });
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/discuss?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ discussMessages: data.messages || [] });
      }
    } catch {}
    set({ loadingDiscuss: false });
  },

  sendDiscussMessage: async (userId, notebookId, type, content, metadata) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type, content, metadata }),
      });
      if (resp.ok) {
        const data = await resp.json();
        set((s) => ({ discussMessages: [...s.discussMessages, data.message] }));
      }
    } catch {}
  },

  // ========== Share ==========
  fetchShareInfo: async (userId, notebookId) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/share?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({ shareConfig: data.share || null, memberCount: data.memberCount || 0 });
      }
    } catch {}
  },

  createShare: async (userId, notebookId, access) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, access: access || "login-required" }),
      });
      if (resp.ok) {
        const data = await resp.json();
        set({ shareConfig: data.share });
        return data.share?.shareId || null;
      }
    } catch {}
    return null;
  },

  revokeShare: async (userId, notebookId) => {
    try {
      await fetch(`/api/notebook/${notebookId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      set({ shareConfig: null });
    } catch {}
  },

  // ========== Podcast ==========
  fetchPodcast: async (userId, notebookId) => {
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/podcast?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        set({
          podcastData: data.podcast || null,
          podcastNarration: data.podcastNarration || null,
          podcastDialogue: data.podcastDialogue || null,
        });
      }
    } catch {}
  },

  generatePodcast: async (userId, notebookId, mode, voices) => {
    set({ generatingPodcast: true });
    try {
      const resp = await fetch(`/api/notebook/${notebookId}/podcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, mode, ...voices }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const podcast = data.podcast;
        set((s) => ({
          podcastData: podcast,
          podcastNarration: mode === "narration" ? podcast : s.podcastNarration,
          podcastDialogue: mode === "dialogue" ? podcast : s.podcastDialogue,
        }));
      }
    } catch {}
    set({ generatingPodcast: false });
  },

  // UI
  setMiddleTab: (tab) => set({ middleTab: tab }),

  clearChatMessages: () => set({ chatMessages: [] }),
  clearDiscussMessages: () => set({ discussMessages: [] }),
}));
