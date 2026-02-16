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

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "messages.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAll(): Record<string, ContactMessage[]> {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, ContactMessage[]>) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
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
