import fs from "fs";
import path from "path";

export interface ContactMessage {
  id: string;
  from: "user" | "admin";
  content: string;
  timestamp: string;
  read?: boolean;
}

export interface UserThread {
  userId: string;
  messages: ContactMessage[];
  lastActivity: string;
}

// 优先用 data/ (本地开发)，其次 /tmp (Vercel)，最后内存兜底
const LOCAL_DIR = path.join(process.cwd(), "data");
const TMP_FILE = "/tmp/openspeech-messages.json";
let memoryStore: Record<string, ContactMessage[]> = {};

function getDataFile(): string | null {
  // 本地开发: 用 data/ 目录
  try {
    if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
    return path.join(LOCAL_DIR, "messages.json");
  } catch {}
  // Vercel: 用 /tmp
  try {
    fs.accessSync("/tmp", fs.constants.W_OK);
    return TMP_FILE;
  } catch {}
  return null;
}

function loadAll(): Record<string, ContactMessage[]> {
  const file = getDataFile();
  if (file) {
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        memoryStore = data;
        return data;
      }
    } catch {}
  }
  return { ...memoryStore };
}

function saveAll(data: Record<string, ContactMessage[]>) {
  memoryStore = data;
  const file = getDataFile();
  if (file) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[message-store] write failed:", err);
    }
  }
}

export function addMessage(userId: string, from: "user" | "admin", content: string): ContactMessage {
  const data = loadAll();
  if (!data[userId]) data[userId] = [];
  const msg: ContactMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from,
    content,
    timestamp: new Date().toISOString(),
  };
  data[userId].push(msg);
  saveAll(data);
  return msg;
}

export function getMessages(userId: string): ContactMessage[] {
  const data = loadAll();
  return data[userId] || [];
}

export function getAllThreads(): UserThread[] {
  const data = loadAll();
  return Object.entries(data)
    .map(([userId, messages]) => ({
      userId,
      messages,
      lastActivity: messages.length > 0 ? messages[messages.length - 1].timestamp : "",
    }))
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export function markAdminRead(userId: string) {
  const data = loadAll();
  if (!data[userId]) return;
  data[userId] = data[userId].map((m) =>
    m.from === "user" ? { ...m, read: true } : m
  );
  saveAll(data);
}

export function getUnreadCount(userId: string): number {
  const data = loadAll();
  if (!data[userId]) return 0;
  return data[userId].filter((m) => m.from === "admin" && !m.read).length;
}
