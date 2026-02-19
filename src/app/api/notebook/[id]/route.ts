import { NextRequest, NextResponse } from "next/server";
import { getRedis, isValidUserId, NB_PREFIX } from "@/lib/notebook-utils";

// GET: 获取单个笔记本详情
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebook = await redis.get(`${NB_PREFIX}${userId}:${params.id}`);
    if (!notebook) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    return NextResponse.json({ notebook });
  } catch (err) {
    console.error("[GET /api/notebook/[id]]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PUT: 更新笔记本信息
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, title, description, icon } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const key = `${NB_PREFIX}${userId}:${params.id}`;
    const existing = await redis.get(key) as Record<string, unknown> | null;
    if (!existing) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    const updated = {
      ...existing,
      ...(title !== undefined && { title: title.slice(0, 100) }),
      ...(description !== undefined && { description: description.slice(0, 500) }),
      ...(icon !== undefined && { icon }),
      updatedAt: new Date().toISOString(),
    };

    await redis.set(key, updated);
    return NextResponse.json({ success: true, notebook: updated });
  } catch (err) {
    console.error("[PUT /api/notebook/[id]]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
