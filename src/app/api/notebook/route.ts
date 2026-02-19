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

// ========== 数据模型 ==========
export interface Notebook {
  id: string;
  title: string;
  description: string;
  icon: string;
  ownerId: string;
  shareId: string | null;       // 分享链接 ID
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookSource {
  id: string;
  type: "file" | "url" | "text" | "knowledge"; // knowledge = 从旧知识库导入
  title: string;
  content: string;              // 提取的纯文本
  summary: string;              // AI 摘要
  metadata: {
    fileName?: string;
    fileType?: string;
    url?: string;
    wordCount: number;
  };
  enabled: boolean;             // 是否参与 AI 分析
  addedAt: string;
}

export interface StudioOutput {
  type: string;
  content: string;
  generatedAt: string;
}

// Redis key 前缀
const NB_PREFIX = "nb:";
const NB_INDEX = "nb_index:";
const NB_SRC_PREFIX = "nb_src:";
const NB_SRC_INDEX = "nb_src_index:";
const NB_CHAT = "nb_chat:";
const NB_STUDIO = "nb_studio:";
const MAX_NOTEBOOKS_PER_USER = 50;

// 导出供其他路由使用
export { getRedis, isValidUserId, NB_PREFIX, NB_INDEX, NB_SRC_PREFIX, NB_SRC_INDEX, NB_CHAT, NB_STUDIO };

// GET: 获取用户的所有笔记本
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const indexKey = `${NB_INDEX}${userId}`;
    const nbIds: string[] = (await redis.lrange(indexKey, 0, -1)) || [];

    if (nbIds.length === 0) {
      return NextResponse.json({ notebooks: [], total: 0 });
    }

    const pipeline = redis.pipeline();
    for (const id of nbIds) {
      pipeline.get(`${NB_PREFIX}${userId}:${id}`);
    }
    const results = await pipeline.exec();

    const notebooks: Notebook[] = results
      .filter((r): r is Notebook => r !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ notebooks, total: notebooks.length });
  } catch (err) {
    console.error("[GET /api/notebook]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 创建新笔记本
export async function POST(req: NextRequest) {
  try {
    const { userId, title, description, icon } = await req.json();

    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    const redis = getRedis();
    const indexKey = `${NB_INDEX}${userId}`;

    // 检查数量限制
    const count = await redis.llen(indexKey);
    if (count >= MAX_NOTEBOOKS_PER_USER) {
      return NextResponse.json({ error: "知识库数量已达上限" }, { status: 400 });
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const notebook: Notebook = {
      id,
      title: (title || "未命名知识库").slice(0, 100),
      description: (description || "").slice(0, 500),
      icon: icon || "📓",
      ownerId: userId,
      shareId: null,
      sourceCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await redis.set(`${NB_PREFIX}${userId}:${id}`, notebook);
    await redis.lpush(indexKey, id);

    return NextResponse.json({ success: true, notebook });
  } catch (err) {
    console.error("[POST /api/notebook]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE: 删除笔记本（及其所有来源、对话、成果）
export async function DELETE(req: NextRequest) {
  try {
    const { userId, notebookId } = await req.json();
    if (!userId || !notebookId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const redis = getRedis();

    // 删除所有来源
    const srcIds: string[] = (await redis.lrange(`${NB_SRC_INDEX}${notebookId}`, 0, -1)) || [];
    const pipeline = redis.pipeline();
    for (const srcId of srcIds) {
      pipeline.del(`${NB_SRC_PREFIX}${notebookId}:${srcId}`);
    }
    pipeline.del(`${NB_SRC_INDEX}${notebookId}`);
    pipeline.del(`${NB_CHAT}${notebookId}`);
    // 删除所有 studio 输出
    const studioTypes = ["guide", "faq", "outline", "timeline", "concepts", "briefing"];
    for (const t of studioTypes) {
      pipeline.del(`${NB_STUDIO}${notebookId}:${t}`);
    }
    pipeline.del(`${NB_PREFIX}${userId}:${notebookId}`);
    pipeline.lrem(`${NB_INDEX}${userId}`, 0, notebookId);
    await pipeline.exec();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/notebook]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
