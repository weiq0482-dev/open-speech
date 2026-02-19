import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId, NB_PREFIX, NB_MEMBERS_PREFIX, NB_DISCUSS } from "@/lib/notebook-utils";

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
    const after = req.nextUrl.searchParams.get("after");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 检查成员资格（成员列表 or owner）
    const isMember = await redis.sismember(`${NB_MEMBERS_PREFIX}${notebookId}`, userId);
    if (!isMember) {
      const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
      if (!nb) {
        return NextResponse.json({ error: "无权访问此讨论组" }, { status: 403 });
      }
    }

    // 使用 Redis List 存储（rpush 追加，lrange 读取）
    const discussKey = `${NB_DISCUSS}${notebookId}`;
    const total = await redis.llen(discussKey);

    // 返回最近 100 条
    const start = Math.max(0, total - 100);
    const rawMessages: string[] = await redis.lrange(discussKey, start, -1);
    const messages: DiscussMessage[] = rawMessages.map((m) => {
      if (typeof m === "string") {
        try { return JSON.parse(m); } catch { return m; }
      }
      return m as unknown as DiscussMessage;
    });

    // 如果有 after 参数，只返回更新的消息
    if (after) {
      const afterTime = new Date(after).getTime();
      const newMessages = messages.filter((m) => new Date(m.timestamp).getTime() > afterTime);
      return NextResponse.json({ messages: newMessages, total });
    }

    return NextResponse.json({ messages, total });
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

    // 使用 Redis List 原子追加（rpush），避免竞态条件
    const discussKey = `${NB_DISCUSS}${notebookId}`;
    await redis.rpush(discussKey, JSON.stringify(msg));

    // 超出上限时修剪
    const len = await redis.llen(discussKey);
    if (len > MAX_DISCUSS_MESSAGES) {
      await redis.ltrim(discussKey, len - MAX_DISCUSS_MESSAGES, -1);
    }

    return NextResponse.json({ success: true, message: msg });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/discuss]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
