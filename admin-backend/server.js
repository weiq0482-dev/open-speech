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
const QUOTA_PREFIX = "quota:";
const PROFILE_PREFIX = "profile:";
const KB_PREFIX = "kb:";
const KB_INDEX = "kb_index:";
const KB_TAGS = "kb_tags:";
const TRASH_PREFIX = "trash:";
const ALL_TRASH_KEY = "all_trash";
const crypto = require("crypto");

// 兼容读取：旧数据是 JSON 数组，新数据是 Redis Set
async function getThreadUserIds() {
  try {
    return (await redis.smembers(ALL_THREADS_KEY)) || [];
  } catch {
    try {
      const old = await redis.get(ALL_THREADS_KEY);
      if (Array.isArray(old) && old.length > 0) {
        await redis.del(ALL_THREADS_KEY);
        for (const uid of old) await redis.sadd(ALL_THREADS_KEY, uid);
        return old;
      }
    } catch {}
    return [];
  }
}

// 静态文件
app.use(express.static(path.join(__dirname, "public")));

// API: 获取所有会话列表
app.get("/api/threads", async (req, res) => {
  try {
    const allUserIds = await getThreadUserIds();
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

// ========== 系统设置 ==========
const SETTINGS_KEY = "system_settings";
const DEFAULT_SETTINGS = { freeTrialDays: 30, freeDailyLimit: 5, shareRewardChat: 29, shareRewardImage: 9, rewardDailyLimit: 10 };

app.get("/api/settings", async (req, res) => {
  try {
    const settings = (await redis.get(SETTINGS_KEY)) || DEFAULT_SETTINGS;
    res.json({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const existing = (await redis.get(SETTINGS_KEY)) || DEFAULT_SETTINGS;
    const updated = { ...existing, ...req.body };
    await redis.set(SETTINGS_KEY, updated);
    console.log("[设置] 更新系统设置:", updated);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 兑换码管理 ==========
const COUPON_PREFIX = "coupon:";
const ALL_COUPONS_KEY = "all_coupons";
const PLAN_CONFIG = {
  trial:     { chatQuota: 50,   imageQuota: 10,  durationDays: 7,  label: "体验卡(7天)" },
  monthly:   { chatQuota: 500,  imageQuota: 50,  durationDays: 30, label: "月卡(30天)" },
  quarterly: { chatQuota: 2000, imageQuota: 200, durationDays: 90, label: "季卡(90天)" },
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

    // 追踪所有已生成的兑换码
    const existing = (await redis.get(ALL_COUPONS_KEY)) || [];
    existing.push(...codes);
    await redis.set(ALL_COUPONS_KEY, existing);

    console.log(`[兑换码] 生成 ${num} 个 ${plan} 兑换码`);
    res.json({ success: true, codes, plan });
  } catch (err) {
    console.error("[POST /api/coupons/generate]", err);
    res.status(500).json({ error: err.message });
  }
});

// API: 查询所有兑换码及状态
app.get("/api/coupons", async (req, res) => {
  try {
    const allCodes = (await redis.get(ALL_COUPONS_KEY)) || [];
    const coupons = [];
    for (const code of allCodes) {
      const data = await redis.get(`${COUPON_PREFIX}${code}`);
      if (data) {
        coupons.push({
          code,
          plan: data.plan,
          planLabel: PLAN_CONFIG[data.plan]?.label || data.plan,
          createdAt: data.createdAt,
          usedBy: data.usedBy || null,
          usedAt: data.usedAt || null,
        });
      }
    }
    // 最新的排在前面
    coupons.reverse();
    res.json({ coupons });
  } catch (err) {
    console.error("[GET /api/coupons]", err);
    res.status(500).json({ error: err.message });
  }
});

// API: 查询单个兑换码
app.get("/api/coupons/:code", async (req, res) => {
  try {
    const data = await redis.get(`${COUPON_PREFIX}${req.params.code}`);
    if (!data) return res.status(404).json({ error: "兑换码不存在" });
    res.json({ code: req.params.code, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 站点配置（二维码、联系方式等） ==========
const SITE_CONFIG_KEY = "site_config";
const DEFAULT_SITE_CONFIG = {
  douyinQrUrl: "/douyin-qr.png",
  douyinAccount: "arch8288",
  douyinDesc: "免费体验卡 · 教程 · 功能更新",
  wechatQrUrl: "/wechat-qr.png",
  wechatGroupName: "Open-speech 超级梦想家",
  wechatDesc: "微信扫码 · 把想法变成现实",
  contactWechatId: "jryg8686",
  contactQrUrl: "/wechat-qr.png",
};

app.get("/api/site-config", async (req, res) => {
  try {
    const config = (await redis.get(SITE_CONFIG_KEY)) || {};
    res.json({ config: { ...DEFAULT_SITE_CONFIG, ...config } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/site-config", async (req, res) => {
  try {
    const existing = (await redis.get(SITE_CONFIG_KEY)) || {};
    const updated = { ...existing, ...req.body };
    await redis.set(SITE_CONFIG_KEY, updated);
    console.log("[站点配置] 更新:", Object.keys(req.body).join(", "));
    res.json({ success: true, config: { ...DEFAULT_SITE_CONFIG, ...updated } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 图片上传（base64）用于二维码更换
app.post("/api/upload-qr", async (req, res) => {
  try {
    const { field, base64Data } = req.body;
    if (!field || !base64Data) return res.status(400).json({ error: "缺少参数" });
    const allowedFields = ["douyinQrUrl", "wechatQrUrl", "contactQrUrl"];
    if (!allowedFields.includes(field)) return res.status(400).json({ error: "无效字段" });

    // 存入 Redis（base64 直接作为 data URL）
    const existing = (await redis.get(SITE_CONFIG_KEY)) || {};
    existing[field] = base64Data;
    await redis.set(SITE_CONFIG_KEY, existing);
    console.log(`[站点配置] 更新二维码图片: ${field}`);
    res.json({ success: true, url: base64Data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 用户监控与锁定 ==========

// 锁定用户
app.post("/api/users/lock", async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    await redis.set(`locked:${userId}`, reason || "异常使用");
    console.log(`[用户锁定] ${userId} 原因: ${reason || "异常使用"}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 解锁用户
app.post("/api/users/unlock", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    await redis.del(`locked:${userId}`);
    console.log(`[用户解锁] ${userId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 查询单个用户详情（配额+设备+锁定状态）
app.get("/api/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const quota = await redis.get(`${QUOTA_PREFIX}${userId}`);
    const locked = await redis.get(`locked:${userId}`);
    const usageLog = await redis.get(`usage_log:${userId}`) || [];
    res.json({ userId, quota, locked, usageLog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 异常监控面板数据：扫描最近注册+高频使用的用户
app.get("/api/monitor", async (req, res) => {
  try {
    // 1. 扫描所有 device_reg: 开头的 key（今日 IP 注册记录）
    const today = new Date().toISOString().slice(0, 10);
    // Upstash 不支持 SCAN，用已知的数据做统计
    // 从所有会话线程中获取活跃用户列表
    const allThreads = (await redis.get("all_threads")) || [];
    
    // 2. 收集用户数据
    const users = [];
    // 从 quota 记录收集
    for (const userId of allThreads) {
      try {
        const quota = await redis.get(`${QUOTA_PREFIX}${userId}`);
        const locked = await redis.get(`locked:${userId}`);
        if (quota) {
          users.push({
            userId,
            plan: quota.plan || "free",
            chatRemaining: quota.chatRemaining || 0,
            imageRemaining: quota.imageRemaining || 0,
            dailyFreeUsed: quota.dailyFreeUsed || 0,
            dailyFreeDate: quota.dailyFreeDate || "",
            freeTrialStarted: quota.freeTrialStarted || "",
            redeemCode: quota.redeemCode || null,
            locked: locked || null,
          });
        }
      } catch {}
    }

    // 3. 也扫描兑换码里绑定的用户
    const allCoupons = (await redis.get("all_coupons")) || [];
    const redeemedUsers = new Set(allThreads);
    for (const code of allCoupons.slice(0, 200)) {
      try {
        const coupon = await redis.get(`${COUPON_PREFIX}${code}`);
        if (coupon && coupon.usedBy && !redeemedUsers.has(coupon.usedBy)) {
          redeemedUsers.add(coupon.usedBy);
          const quota = await redis.get(`${QUOTA_PREFIX}${coupon.usedBy}`);
          const locked = await redis.get(`locked:${coupon.usedBy}`);
          if (quota) {
            users.push({
              userId: coupon.usedBy,
              plan: quota.plan || "free",
              chatRemaining: quota.chatRemaining || 0,
              imageRemaining: quota.imageRemaining || 0,
              dailyFreeUsed: quota.dailyFreeUsed || 0,
              dailyFreeDate: quota.dailyFreeDate || "",
              freeTrialStarted: quota.freeTrialStarted || "",
              redeemCode: quota.redeemCode || null,
              locked: locked || null,
            });
          }
        }
      } catch {}
    }

    // 4. 异常检测：标记可疑用户
    const suspicious = users.filter((u) => {
      // 免费用户当天用量接近或超过限额
      if (u.plan === "free" && u.dailyFreeUsed >= 4 && u.dailyFreeDate === today) return true;
      return false;
    });

    res.json({
      total: users.length,
      users: users.sort((a, b) => (b.dailyFreeUsed || 0) - (a.dailyFreeUsed || 0)),
      suspicious,
      today,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 记录使用日志（供 chat API 调用，也可前端自行统计）
app.post("/api/usage-log", async (req, res) => {
  try {
    const { userId, ip, type, tool } = req.body;
    if (!userId) return res.status(400).json({ error: "缺少 userId" });
    const logKey = `usage_log:${userId}`;
    const logs = (await redis.get(logKey)) || [];
    logs.push({
      time: new Date().toISOString(),
      ip: ip || "unknown",
      type: type || "chat",
      tool: tool || "none",
    });
    // 只保留最近 100 条
    if (logs.length > 100) logs.splice(0, logs.length - 100);
    await redis.set(logKey, logs);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 账户重置（数据移入垃圾箱） ==========
function emailToUserId(email) {
  const hash = crypto.createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
  return `em_${hash.slice(0, 16)}`;
}

// 查找用户（支持 userId 或邮箱）
function resolveUserId(input) {
  if (!input) return null;
  input = input.trim();
  if (input.startsWith("em_") || input.startsWith("u_")) return input;
  if (input.includes("@")) return emailToUserId(input);
  return input;
}

// 重置用户账户 - 将数据备份到垃圾箱后清除
app.post("/api/users/reset", async (req, res) => {
  try {
    const { userId: rawId, resetProfile, resetKnowledge, resetQuota, resetAll } = req.body;
    const userId = resolveUserId(rawId);
    if (!userId) return res.status(400).json({ error: "缺少 userId 或邮箱" });

    const trashId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const trashData = { id: trashId, userId, deletedAt: new Date().toISOString(), items: {} };

    const doAll = !!resetAll;

    // 备份并清除用户资料
    if (doAll || resetProfile) {
      const profile = await redis.get(`${PROFILE_PREFIX}${userId}`);
      if (profile) {
        trashData.items.profile = profile;
        await redis.del(`${PROFILE_PREFIX}${userId}`);
      }
    }

    // 备份并清除知识库
    if (doAll || resetKnowledge) {
      const indexKey = `${KB_INDEX}${userId}`;
      const itemIds = (await redis.lrange(indexKey, 0, -1)) || [];
      const kbItems = [];
      for (const itemId of itemIds) {
        const item = await redis.get(`${KB_PREFIX}${userId}:${itemId}`);
        if (item) {
          kbItems.push(item);
          await redis.del(`${KB_PREFIX}${userId}:${itemId}`);
        }
      }
      if (kbItems.length > 0) trashData.items.knowledge = kbItems;
      await redis.del(indexKey);
      await redis.del(`${KB_TAGS}${userId}`);
    }

    // 备份并清除配额
    if (doAll || resetQuota) {
      const quota = await redis.get(`${QUOTA_PREFIX}${userId}`);
      if (quota) {
        trashData.items.quota = quota;
        await redis.del(`${QUOTA_PREFIX}${userId}`);
      }
    }

    // 保存到垃圾箱
    if (Object.keys(trashData.items).length > 0) {
      await redis.set(`${TRASH_PREFIX}${trashId}`, trashData);
      // 添加到垃圾箱索引
      await redis.lpush(ALL_TRASH_KEY, trashId);
    }

    console.log(`[账户重置] ${userId} | 项目: ${Object.keys(trashData.items).join(", ")}`);
    res.json({ success: true, trashId, resetItems: Object.keys(trashData.items) });
  } catch (err) {
    console.error("[POST /api/users/reset]", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 垃圾箱管理 ==========

// 查看垃圾箱列表
app.get("/api/trash", async (req, res) => {
  try {
    const trashIds = (await redis.lrange(ALL_TRASH_KEY, 0, 49)) || [];
    const items = [];
    for (const id of trashIds) {
      const data = await redis.get(`${TRASH_PREFIX}${id}`);
      if (data) {
        items.push({
          id: data.id,
          userId: data.userId,
          deletedAt: data.deletedAt,
          types: Object.keys(data.items),
          summary: {
            profile: !!data.items.profile,
            knowledgeCount: data.items.knowledge?.length || 0,
            quota: !!data.items.quota,
          },
        });
      }
    }
    res.json({ items });
  } catch (err) {
    console.error("[GET /api/trash]", err);
    res.status(500).json({ error: err.message });
  }
});

// 查看垃圾箱详情
app.get("/api/trash/:trashId", async (req, res) => {
  try {
    const data = await redis.get(`${TRASH_PREFIX}${req.params.trashId}`);
    if (!data) return res.status(404).json({ error: "垃圾箱项目不存在" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 恢复垃圾箱数据
app.post("/api/trash/restore", async (req, res) => {
  try {
    const { trashId } = req.body;
    if (!trashId) return res.status(400).json({ error: "缺少 trashId" });

    const data = await redis.get(`${TRASH_PREFIX}${trashId}`);
    if (!data) return res.status(404).json({ error: "垃圾箱项目不存在" });

    const userId = data.userId;
    const restored = [];

    // 恢复用户资料
    if (data.items.profile) {
      await redis.set(`${PROFILE_PREFIX}${userId}`, data.items.profile);
      restored.push("profile");
    }

    // 恢复知识库
    if (data.items.knowledge && data.items.knowledge.length > 0) {
      const indexKey = `${KB_INDEX}${userId}`;
      for (const item of data.items.knowledge) {
        await redis.set(`${KB_PREFIX}${userId}:${item.id}`, item);
        await redis.lpush(indexKey, item.id);
      }
      restored.push(`knowledge(${data.items.knowledge.length})`);
    }

    // 恢复配额
    if (data.items.quota) {
      await redis.set(`${QUOTA_PREFIX}${userId}`, data.items.quota);
      restored.push("quota");
    }

    // 从垃圾箱中移除
    await redis.del(`${TRASH_PREFIX}${trashId}`);
    await redis.lrem(ALL_TRASH_KEY, 0, trashId);

    console.log(`[垃圾箱恢复] ${userId} | 恢复: ${restored.join(", ")}`);
    res.json({ success: true, restored });
  } catch (err) {
    console.error("[POST /api/trash/restore]", err);
    res.status(500).json({ error: err.message });
  }
});

// 永久删除垃圾箱数据
app.delete("/api/trash/:trashId", async (req, res) => {
  try {
    const { trashId } = req.params;
    await redis.del(`${TRASH_PREFIX}${trashId}`);
    await redis.lrem(ALL_TRASH_KEY, 0, trashId);
    console.log(`[垃圾箱] 永久删除: ${trashId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 查询用户信息（支持邮箱查询）
app.get("/api/users/lookup", async (req, res) => {
  try {
    const input = req.query.q;
    const userId = resolveUserId(input);
    if (!userId) return res.status(400).json({ error: "请输入 userId 或邮箱" });

    const [profile, quota, locked, kbCount] = await Promise.all([
      redis.get(`${PROFILE_PREFIX}${userId}`),
      redis.get(`${QUOTA_PREFIX}${userId}`),
      redis.get(`locked:${userId}`),
      redis.llen(`${KB_INDEX}${userId}`),
    ]);

    res.json({
      userId,
      email: input?.includes("@") ? input.trim() : null,
      profile: profile || null,
      quota: quota || null,
      locked: locked || null,
      knowledgeCount: kbCount || 0,
    });
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
