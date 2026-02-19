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

function isValidUserId(id: string): boolean {
  return /^u_[a-f0-9]{12}_[a-z0-9]+$/.test(id) || /^em_[a-f0-9]{16}$/.test(id);
}

const NB_PREFIX = "nb:";
const NB_MEMBERS_PREFIX = "nb_members:";
const NB_DISCUSS_PREFIX = "nb_discuss:";
const PROFILE_PREFIX = "profile:";
const MAX_DISCUSS_MESSAGES = 500;

export interface DiscussMessage {
  id: string;
  userId: string;
  userName: string;
  userIcon: string;
  type: "text" | "image" | "file" | "system";
  content: string;         // 文字内容或图片 base64 或文件元信息 JSON
  timestamp: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    replyTo?: string;      // 回复某条消息的 ID
  };
}

// GET: 获取讨论消息（支持轮询）
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const after = req.nextUrl.searchParams.get("after"); // 时间戳，获取此时间之后的消息
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 检查成员资格
    const isMember = await redis.sismember(`${NB_MEMBERS_PREFIX}${notebookId}`, userId);
    // 也检查是否是 owner
    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
    if (!isMember && !nb) {
      // 尝试查找是否任何用户的该笔记本存在（支持非 owner 成员访问）
      // 简化处理：成员列表中有就允许
      if (!isMember) {
        return NextResponse.json({ error: "无权访问此讨论组" }, { status: 403 });
      }
    }

    const discussKey = `${NB_DISCUSS_PREFIX}${notebookId}`;
    const messages: DiscussMessage[] = (await redis.get(discussKey) as DiscussMessage[]) || [];

    // 如果有 after 参数，只返回更新的消息
    if (after) {
      const afterTime = new Date(after).getTime();
      const newMessages = messages.filter((m) => new Date(m.timestamp).getTime() > afterTime);
      return NextResponse.json({ messages: newMessages, total: messages.length });
    }

    // 返回最近 100 条
    return NextResponse.json({
      messages: messages.slice(-100),
      total: messages.length,
    });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/discuss]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 发送讨论消息
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, type, content, metadata } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }
    if (!content || !type) {
      return NextResponse.json({ error: "缺少消息内容" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 检查成员资格
    const isMember = await redis.sismember(`${NB_MEMBERS_PREFIX}${notebookId}`, userId);
    if (!isMember) {
      return NextResponse.json({ error: "请先加入此知识库讨论组" }, { status: 403 });
    }

    // 获取用户名
    const profile = await redis.get(`${PROFILE_PREFIX}${userId}`) as Record<string, unknown> | null;
    const userName = (profile?.nickname as string) || (profile?.email as string) || userId.slice(0, 8) + "...";
    const userIcon = (profile?.avatar as string) || "";

    // 构建消息
    const msg: DiscussMessage = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      userName,
      userIcon,
      type: type as DiscussMessage["type"],
      content: type === "image"
        ? content.slice(0, 500000)  // 图片 base64 限制 ~375KB
        : content.slice(0, 5000),   // 文字限制 5000 字
      timestamp: new Date().toISOString(),
      metadata: metadata || undefined,
    };

    // 保存消息
    const discussKey = `${NB_DISCUSS_PREFIX}${notebookId}`;
    const messages: DiscussMessage[] = (await redis.get(discussKey) as DiscussMessage[]) || [];
    messages.push(msg);

    // 只保留最近 N 条
    const trimmed = messages.slice(-MAX_DISCUSS_MESSAGES);
    await redis.set(discussKey, trimmed);

    return NextResponse.json({ success: true, message: msg });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/discuss]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
