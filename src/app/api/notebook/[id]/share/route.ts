import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId, NB_PREFIX, NB_SHARE_PREFIX, NB_MEMBERS_PREFIX } from "@/lib/notebook-utils";

export interface ShareConfig {
  shareId: string;
  notebookId: string;
  ownerId: string;
  access: "public" | "login-required"; // public: 未登录可看 Studio; login-required: 必须登录
  createdAt: string;
}

// POST: 创建/更新分享链接
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, access } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 验证笔记本属于该用户
    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`) as Record<string, unknown> | null;
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    // 如果已有分享链接，返回现有的
    if (nb.shareId) {
      const existing = await redis.get(`${NB_SHARE_PREFIX}${nb.shareId}`) as ShareConfig | null;
      if (existing) {
        // 更新 access 设置
        if (access && access !== existing.access) {
          existing.access = access;
          await redis.set(`${NB_SHARE_PREFIX}${nb.shareId}`, existing);
        }
        return NextResponse.json({ success: true, share: existing });
      }
    }

    // 生成新的分享 ID（短链接友好）
    const shareId = generateShareId();
    const share: ShareConfig = {
      shareId,
      notebookId,
      ownerId: userId,
      access: access || "login-required",
      createdAt: new Date().toISOString(),
    };

    // 保存分享配置
    await redis.set(`${NB_SHARE_PREFIX}${shareId}`, share);
    // 更新笔记本的 shareId
    await redis.set(`${NB_PREFIX}${userId}:${notebookId}`, { ...nb, shareId });
    // 把 owner 加入成员列表
    await redis.sadd(`${NB_MEMBERS_PREFIX}${notebookId}`, userId);

    return NextResponse.json({ success: true, share });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/share]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE: 撤销分享
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`) as Record<string, unknown> | null;
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    if (nb.shareId) {
      await redis.del(`${NB_SHARE_PREFIX}${nb.shareId}`);
      await redis.set(`${NB_PREFIX}${userId}:${notebookId}`, { ...nb, shareId: null });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/notebook/[id]/share]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// GET: 获取分享信息
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`) as Record<string, unknown> | null;
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    if (!nb.shareId) {
      return NextResponse.json({ shared: false });
    }

    const share = await redis.get(`${NB_SHARE_PREFIX}${nb.shareId}`) as ShareConfig | null;
    const memberCount = await redis.scard(`${NB_MEMBERS_PREFIX}${notebookId}`);

    return NextResponse.json({ shared: true, share, memberCount });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/share]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

function generateShareId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
