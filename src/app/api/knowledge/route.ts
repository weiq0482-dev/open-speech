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

const KNOWLEDGE_PREFIX = "kb:";
const KNOWLEDGE_INDEX = "kb_index:";
const MAX_ITEMS_PER_USER = 500;

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  summary: string;
  source: "deep-research" | "chat" | "manual";
  sourceUrl?: string;
  tags: string[];
  savedAt: string;
}

// GET: 查询用户知识库
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const search = req.nextUrl.searchParams.get("search") || "";
    const tag = req.nextUrl.searchParams.get("tag") || "";

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }

    const redis = getRedis();
    const indexKey = `${KNOWLEDGE_INDEX}${userId}`;
    const itemIds: string[] = (await redis.lrange(indexKey, 0, -1)) || [];

    if (itemIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, tags: [] });
    }

    // 批量获取所有知识条目
    const pipeline = redis.pipeline();
    for (const id of itemIds) {
      pipeline.get(`${KNOWLEDGE_PREFIX}${userId}:${id}`);
    }
    const results = await pipeline.exec();

    let items: KnowledgeItem[] = results
      .filter((r): r is KnowledgeItem => r !== null)
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

    // 收集所有标签
    const allTags = new Set<string>();
    items.forEach(item => item.tags?.forEach(t => allTags.add(t)));

    // 搜索过滤
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(item =>
        item.title.toLowerCase().includes(lower) ||
        item.content.toLowerCase().includes(lower) ||
        item.summary.toLowerCase().includes(lower) ||
        item.tags?.some(t => t.toLowerCase().includes(lower))
      );
    }

    // 标签过滤
    if (tag) {
      items = items.filter(item => item.tags?.includes(tag));
    }

    return NextResponse.json({
      items,
      total: items.length,
      tags: Array.from(allTags).sort(),
    });
  } catch (err) {
    console.error("[GET /api/knowledge]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 保存知识条目
export async function POST(req: NextRequest) {
  try {
    const { userId, title, content, summary, source, sourceUrl, tags } = await req.json();

    if (!userId || !title || !content) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const redis = getRedis();
    const indexKey = `${KNOWLEDGE_INDEX}${userId}`;

    // 检查数量限制
    const count = await redis.llen(indexKey);
    if (count >= MAX_ITEMS_PER_USER) {
      return NextResponse.json({ error: "知识库已满，请删除部分条目后再试" }, { status: 400 });
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const item: KnowledgeItem = {
      id,
      title: title.slice(0, 200),
      content: content.slice(0, 50000),
      summary: (summary || content.slice(0, 300)).slice(0, 500),
      source: source || "manual",
      sourceUrl: sourceUrl || undefined,
      tags: (tags || []).slice(0, 10).map((t: string) => t.slice(0, 30)),
      savedAt: new Date().toISOString(),
    };

    // 存储知识条目
    await redis.set(`${KNOWLEDGE_PREFIX}${userId}:${id}`, item);
    // 添加到用户索引
    await redis.lpush(indexKey, id);

    return NextResponse.json({ success: true, item });
  } catch (err) {
    console.error("[POST /api/knowledge]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE: 删除知识条目
export async function DELETE(req: NextRequest) {
  try {
    const { userId, itemId } = await req.json();

    if (!userId || !itemId) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const redis = getRedis();
    const indexKey = `${KNOWLEDGE_INDEX}${userId}`;

    // 从索引中移除
    await redis.lrem(indexKey, 0, itemId);
    // 删除知识条目
    await redis.del(`${KNOWLEDGE_PREFIX}${userId}:${itemId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/knowledge]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
