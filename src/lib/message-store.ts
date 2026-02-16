import { Redis } from "@upstash/redis";

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

// Redis 客户端
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const THREAD_PREFIX = "thread:";
const ALL_THREADS_KEY = "all_threads";

// 生成消息 ID
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 添加消息
export function addMessage(userId: string, from: "user" | "admin", content: string): ContactMessage {
  const msg: ContactMessage = {
    id: generateMessageId(),
    from,
    content: content.trim(),
    timestamp: new Date().toISOString(),
    read: from === "admin",
  };

  // 异步保存到 Redis
  (async () => {
    try {
      const threadKey = `${THREAD_PREFIX}${userId}`;
      const existing = await redis.get<UserThread>(threadKey);
      
      const thread: UserThread = {
        userId,
        messages: existing ? [...existing.messages, msg] : [msg],
        lastActivity: msg.timestamp,
      };

      await redis.set(threadKey, thread);
      
      const allThreads = await redis.get<string[]>(ALL_THREADS_KEY) || [];
      if (!allThreads.includes(userId)) {
        allThreads.push(userId);
        await redis.set(ALL_THREADS_KEY, allThreads);
      }
    } catch (err) {
      console.error("[Redis addMessage error]", err);
    }
  })();

  return msg;
}

// 获取用户消息（同步版本，返回空数组）
export function getMessages(userId: string): ContactMessage[] {
  return [];
}

// 异步获取用户消息
export async function getMessagesAsync(userId: string): Promise<ContactMessage[]> {
  try {
    const thread = await redis.get<UserThread>(`${THREAD_PREFIX}${userId}`);
    return thread?.messages || [];
  } catch (err) {
    console.error("[Redis getMessages error]", err);
    return [];
  }
}

// 获取所有线程（同步版本，返回空数组）
export function getAllThreads(): UserThread[] {
  return [];
}

// 异步获取所有线程
export async function getAllThreadsAsync(): Promise<UserThread[]> {
  try {
    const allUserIds = await redis.get<string[]>(ALL_THREADS_KEY) || [];
    const threads: UserThread[] = [];
    
    for (const userId of allUserIds) {
      const thread = await redis.get<UserThread>(`${THREAD_PREFIX}${userId}`);
      if (thread) {
        threads.push(thread);
      }
    }
    
    return threads.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  } catch (err) {
    console.error("[Redis getAllThreads error]", err);
    return [];
  }
}

// 标记管理员已读
export function markAdminRead(userId: string) {
  (async () => {
    try {
      const threadKey = `${THREAD_PREFIX}${userId}`;
      const thread = await redis.get<UserThread>(threadKey);
      
      if (thread) {
        thread.messages = thread.messages.map((msg: ContactMessage) => 
          msg.from === "user" ? { ...msg, read: true } : msg
        );
        await redis.set(threadKey, thread);
      }
    } catch (err) {
      console.error("[Redis markAdminRead error]", err);
    }
  })();
}

// 获取未读数量
export function getUnreadCount(userId: string): number {
  return 0;
}

// 异步获取未读数量
export async function getUnreadCountAsync(): Promise<number> {
  try {
    const allThreads = await getAllThreadsAsync();
    let unreadCount = 0;
    
    for (const thread of allThreads) {
      const unreadMessages = thread.messages.filter(
        msg => msg.from === "user" && !msg.read
      );
      unreadCount += unreadMessages.length;
    }
    
    return unreadCount;
  } catch (err) {
    console.error("[Redis getUnreadCount error]", err);
    return 0;
  }
}
