const express = require("express");
const path = require("path");
const { Redis } = require("@upstash/redis");

// 加载项目根目录的 .env.local
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const app = express();
app.use(express.json({ limit: "2mb" }));

// Redis 客户端
const redis = new Redis({
  url: (process.env.KV_REST_API_URL || "").trim(),
  token: (process.env.KV_REST_API_TOKEN || "").trim(),
});

const THREAD_PREFIX = "thread:";
const ALL_THREADS_KEY = "all_threads";

// 静态文件
app.use(express.static(path.join(__dirname, "public")));

// API: 获取所有会话列表
app.get("/api/threads", async (req, res) => {
  try {
    const allUserIds = (await redis.get(ALL_THREADS_KEY)) || [];
    const threads = [];

    for (const userId of allUserIds) {
      const thread = await redis.get(`${THREAD_PREFIX}${userId}`);
      if (thread) {
        const unread = thread.messages.filter(
          (m) => m.from === "user" && !m.read
        ).length;
        threads.push({ ...thread, unread });
      }
    }

    threads.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    res.json({ threads });
  } catch (err) {
    console.error("[GET /api/threads]", err);
    res.status(500).json({ error: err.message });
  }
});

// API: 获取单个会话消息
app.get("/api/messages/:userId", async (req, res) => {
  try {
    const thread = await redis.get(
      `${THREAD_PREFIX}${req.params.userId}`
    );
    res.json({ messages: thread?.messages || [] });
  } catch (err) {
    console.error("[GET /api/messages]", err);
    res.status(500).json({ error: err.message });
  }
});

// API: 发送回复（直接写 Redis，不再绕道 Vercel API）
app.post("/api/reply", async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message?.trim()) {
      return res.status(400).json({ error: "缺少参数" });
    }

    // 构造消息对象（格式与 message-store.ts 的 addMessage 保持一致）
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: "admin",
      content: message.trim(),
      timestamp: new Date().toISOString(),
      read: true,
    };

    // 直接写入 Redis
    const threadKey = `${THREAD_PREFIX}${userId}`;
    const existing = await redis.get(threadKey);

    const thread = {
      userId,
      messages: existing ? [...existing.messages, msg] : [msg],
      lastActivity: msg.timestamp,
    };

    await redis.set(threadKey, thread);

    // 确保用户在全局列表中
    const allThreads = (await redis.get(ALL_THREADS_KEY)) || [];
    if (!allThreads.includes(userId)) {
      allThreads.push(userId);
      await redis.set(ALL_THREADS_KEY, allThreads);
    }

    console.log(`[回复] → 用户 ${userId.slice(0, 8)}...: ${message.trim().slice(0, 50)}`);
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error("[POST /api/reply]", err);
    res.status(500).json({ error: err.message });
  }
});

// API: 标记已读
app.post("/api/mark-read", async (req, res) => {
  try {
    const { userId } = req.body;
    const threadKey = `${THREAD_PREFIX}${userId}`;
    const thread = await redis.get(threadKey);

    if (thread) {
      thread.messages = thread.messages.map((msg) =>
        msg.from === "user" ? { ...msg, read: true } : msg
      );
      await redis.set(threadKey, thread);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[POST /api/mark-read]", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 兑换码管理 ==========
const COUPON_PREFIX = "coupon:";
const PLAN_CONFIG = {
  trial:     { chatQuota: 50,   imageQuota: 10,  durationDays: 7 },
  monthly:   { chatQuota: 500,  imageQuota: 50,  durationDays: 30 },
  quarterly: { chatQuota: 2000, imageQuota: 200, durationDays: 90 },
};

// API: 生成兑换码
app.post("/api/coupons/generate", async (req, res) => {
  try {
    const { plan = "trial", count = 5 } = req.body;
    const config = PLAN_CONFIG[plan];
    if (!config) return res.status(400).json({ error: "无效的套餐类型" });

    const num = Math.min(Math.max(1, count), 50);
    const codes = [];
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (let i = 0; i < num; i++) {
      const p1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const p2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const code = `OS-${p1}-${p2}`;

      await redis.set(`${COUPON_PREFIX}${code}`, {
        plan,
        chatQuota: config.chatQuota,
        imageQuota: config.imageQuota,
        durationDays: config.durationDays,
        createdAt: new Date().toISOString(),
      });
      codes.push(code);
    }

    console.log(`[兑换码] 生成 ${num} 个 ${plan} 兑换码`);
    res.json({ success: true, codes, plan });
  } catch (err) {
    console.error("[POST /api/coupons/generate]", err);
    res.status(500).json({ error: err.message });
  }
});

// API: 查询兑换码列表
app.get("/api/coupons", async (req, res) => {
  try {
    const { plan } = req.query;
    // 扫描所有 coupon: 前缀的 key（简单实现，适合小规模）
    // 注意：生产环境应用 SCAN，这里用列表追踪
    res.json({ message: "请使用 /api/coupons/generate 生成兑换码" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.ADMIN_PORT || 3088;
app.listen(PORT, () => {
  console.log(`\n🎧 OpenSpeech 客服管理后台已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   Redis: ${(process.env.KV_REST_API_URL || "").trim().slice(0, 30)}...`);
  console.log(`   模式: 直连 Redis（无需 Vercel 中转）\n`);
});
