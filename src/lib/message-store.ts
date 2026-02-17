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

// Redis 客户端（延迟初始化）
let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return redisClient;
}

const THREAD_PREFIX = "thread:";
const ALL_THREADS_KEY = "all_threads";

// 兼容读取：旧数据是 JSON 数组（string 类型），新数据是 Redis Set
// 首次读到旧格式时自动迁移
async function getThreadUserIds(redis: Redis): Promise<string[]> {
  try {
    // 先尝试作为 Set 读取
    return (await redis.smembers(ALL_THREADS_KEY)) as string[];
  } catch {
    // 如果失败，可能是旧的 JSON 数组格式
    try {
      const old = await redis.get<string[]>(ALL_THREADS_KEY);
      if (Array.isArray(old) && old.length > 0) {
        // 迁移：删除旧 key，用 sadd 重建为 Set
        await redis.del(ALL_THREADS_KEY);
        for (const uid of old) {
          await redis.sadd(ALL_THREADS_KEY, uid);
        }
        return old;
      }
    } catch {}
    return [];
  }
}

// 生成消息 ID
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 添加消息（异步，等待 Redis 写入完成）
export async function addMessage(userId: string, from: "user" | "admin", content: string): Promise<ContactMessage> {
  const msg: ContactMessage = {
    id: generateMessageId(),
    from,
    content: content.trim(),
    timestamp: new Date().toISOString(),
    read: from === "admin",
  };

  try {
    const redis = getRedis();
    const threadKey = `${THREAD_PREFIX}${userId}`;
    const existing = await redis.get<UserThread>(threadKey);
    
    let messages = existing ? [...existing.messages, msg] : [msg];
    // 每个用户最多保留 200 条消息，防止 Redis 内存膨胀
    if (messages.length > 200) messages = messages.slice(-200);
    const thread: UserThread = {
      userId,
      messages,
      lastActivity: msg.timestamp,
    };

    await redis.set(threadKey, thread);
    
    // 使用 Redis Set 原子操作，避免并发竞态
    try {
      await redis.sadd(ALL_THREADS_KEY, userId);
    } catch {
      // 旧格式兼容：如果 sadd 失败，先迁移再重试
      await getThreadUserIds(redis);
      await redis.sadd(ALL_THREADS_KEY, userId);
    }
  } catch (err) {
    console.error("[Redis addMessage error]", err);
  }

  return msg;
}

// 获取用户消息（同步版本，返回空数组）
export function getMessages(userId: string): ContactMessage[] {
  return [];
}

// 异步获取用户消息
export async function getMessagesAsync(userId: string): Promise<ContactMessage[]> {
  try {
    const redis = getRedis();
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
    const redis = getRedis();
    const allUserIds = await getThreadUserIds(redis);
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
      const redis = getRedis();
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
