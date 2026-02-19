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
const NB_SRC_PREFIX = "nb_src:";
const NB_SRC_INDEX = "nb_src_index:";
const MAX_SOURCES = 50;

interface NotebookSource {
  id: string;
  type: "file" | "url" | "text" | "knowledge";
  title: string;
  content: string;
  summary: string;
  metadata: {
    fileName?: string;
    fileType?: string;
    url?: string;
    wordCount: number;
  };
  enabled: boolean;
  addedAt: string;
}

// GET: 获取笔记本的所有来源
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 验证笔记本存在
    const nb = await redis.get(`${NB_PREFIX}${userId}:${notebookId}`);
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    const srcIds: string[] = (await redis.lrange(`${NB_SRC_INDEX}${notebookId}`, 0, -1)) || [];
    if (srcIds.length === 0) {
      return NextResponse.json({ sources: [], total: 0 });
    }

    const pipeline = redis.pipeline();
    for (const id of srcIds) {
      pipeline.get(`${NB_SRC_PREFIX}${notebookId}:${id}`);
    }
    const results = await pipeline.exec();

    const sources: NotebookSource[] = results
      .filter((r): r is NotebookSource => r !== null)
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    return NextResponse.json({ sources, total: sources.length });
  } catch (err) {
    console.error("[GET /api/notebook/[id]/sources]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 添加来源
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, type, title, content, metadata } = await req.json();
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }
    if (!type || !title || !content) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 验证笔记本存在且属于该用户
    const nbKey = `${NB_PREFIX}${userId}:${notebookId}`;
    const nb = await redis.get(nbKey) as Record<string, unknown> | null;
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    // 检查来源数量限制
    const srcIndexKey = `${NB_SRC_INDEX}${notebookId}`;
    const srcCount = await redis.llen(srcIndexKey);
    if (srcCount >= MAX_SOURCES) {
      return NextResponse.json({ error: `来源数量已达上限(${MAX_SOURCES}个)` }, { status: 400 });
    }

    const srcId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trimmedContent = content.slice(0, 100000); // 每个来源最多 10 万字
    const source: NotebookSource = {
      id: srcId,
      type,
      title: title.slice(0, 200),
      content: trimmedContent,
      summary: trimmedContent.slice(0, 300) + (trimmedContent.length > 300 ? "..." : ""),
      metadata: {
        fileName: metadata?.fileName,
        fileType: metadata?.fileType,
        url: metadata?.url,
        wordCount: trimmedContent.length,
      },
      enabled: true,
      addedAt: new Date().toISOString(),
    };

    await redis.set(`${NB_SRC_PREFIX}${notebookId}:${srcId}`, source);
    await redis.lpush(srcIndexKey, srcId);

    // 更新笔记本的来源计数
    const newCount = (srcCount || 0) + 1;
    await redis.set(nbKey, { ...nb, sourceCount: newCount, updatedAt: new Date().toISOString() });

    return NextResponse.json({ success: true, source });
  } catch (err) {
    console.error("[POST /api/notebook/[id]/sources]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE: 删除来源
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, sourceId } = await req.json();
    if (!userId || !sourceId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;

    // 验证笔记本属于该用户
    const nbKey = `${NB_PREFIX}${userId}:${notebookId}`;
    const nb = await redis.get(nbKey) as Record<string, unknown> | null;
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    const srcIndexKey = `${NB_SRC_INDEX}${notebookId}`;
    await redis.lrem(srcIndexKey, 0, sourceId);
    await redis.del(`${NB_SRC_PREFIX}${notebookId}:${sourceId}`);

    // 更新来源计数
    const newCount = Math.max(0, ((nb.sourceCount as number) || 1) - 1);
    await redis.set(nbKey, { ...nb, sourceCount: newCount, updatedAt: new Date().toISOString() });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/notebook/[id]/sources]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PATCH: 切换来源启用/禁用
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, sourceId, enabled } = await req.json();
    if (!userId || !sourceId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const redis = getRedis();
    const notebookId = params.id;
    const srcKey = `${NB_SRC_PREFIX}${notebookId}:${sourceId}`;
    const source = await redis.get(srcKey) as Record<string, unknown> | null;
    if (!source) {
      return NextResponse.json({ error: "来源不存在" }, { status: 404 });
    }

    await redis.set(srcKey, { ...source, enabled: !!enabled });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/notebook/[id]/sources]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
