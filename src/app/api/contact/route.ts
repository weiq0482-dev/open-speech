import { NextRequest, NextResponse } from "next/server";
import { addMessage, getMessagesAsync, getAllThreadsAsync, markAdminRead } from "@/lib/message-store";
import { Redis } from "@upstash/redis";

const ADMIN_KEY = (process.env.ADMIN_KEY || "openspeech-admin-2026").trim();

// 用户消息频率限制
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

const MSG_RATE_LIMIT = 20; // 每小时最多 20 条
const MSG_RATE_WINDOW = 3600;

async function checkMsgRate(userId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `rate:msg:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, MSG_RATE_WINDOW);
  return count <= MSG_RATE_LIMIT;
}

// GET: 获取消息
// ?userId=xxx      → 获取该用户的对话记录
// ?admin=1&key=xxx → 获取所有用户对话列表
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const isAdmin = searchParams.get("admin") === "1";
  const key = searchParams.get("key");

  if (isAdmin) {
    if (key !== ADMIN_KEY) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const threads = await getAllThreadsAsync();
    return NextResponse.json({ threads });
  }

  if (userId) {
    const messages = await getMessagesAsync(userId);
    return NextResponse.json({ messages });
  }

  return NextResponse.json({ error: "缺少参数" }, { status: 400 });
}

// POST: 发送消息 / 管理员回复
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, message, adminKey, action } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    // 管理员回复
    if (action === "reply") {
      if (adminKey?.trim() !== ADMIN_KEY) {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }
      const msg = await addMessage(userId, "admin", message.trim());
      return NextResponse.json({ success: true, message: msg });
    }

    // 管理员已读标记
    if (action === "markRead") {
      if (adminKey?.trim() !== ADMIN_KEY) {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }
      markAdminRead(userId);
      return NextResponse.json({ success: true });
    }

    // 用户发送消息
    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    // 频率限制
    const allowed = await checkMsgRate(userId);
    if (!allowed) {
      return NextResponse.json({ error: "发送过于频繁，请稍后再试" }, { status: 429 });
    }

    const msg = await addMessage(userId, "user", message.trim());

    // Webhook 通知管理员
    const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
    if (webhookUrl) {
      const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "http://localhost:3000").trim();
      const replyUrl = `${appUrl}/reply?u=${encodeURIComponent(userId)}&k=${encodeURIComponent(ADMIN_KEY.trim())}`;
      const text = `📩 用户反馈\n用户ID: ${userId.slice(0, 8)}...\n时间: ${timestamp}\n内容: ${message}\n\n� 点击回复: ${replyUrl}`;

      const webhookBody = { msgtype: "text", text: { content: text } };

      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookBody),
      }).catch((err) => console.error("[Webhook error]", err));
    }

    return NextResponse.json({ success: true, message: msg });
  } catch (error) {
    console.error("[Contact API error]", error);
    return NextResponse.json({ error: "服务异常" }, { status: 500 });
  }
}
