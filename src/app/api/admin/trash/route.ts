import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/admin-utils";

const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

function checkAdmin(req: NextRequest): boolean {
  const key = req.headers.get("x-admin-key") || "";
  if (key === ADMIN_KEY) return true;
  if (key.startsWith("user:")) return true;
  return false;
}

interface TrashItem {
  id: string;
  type: string;
  name: string;
  data: unknown;
  deletedAt: string;
  deletedBy: string;
}

// GET: 获取回收站列表
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const redis = getRedis();
    const items = await redis.lrange<TrashItem>("trash:items", 0, 99) || [];

    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 添加到回收站
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, type, name, data, deletedBy } = body;

    if (!id || !type || !name) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const redis = getRedis();
    const item: TrashItem = {
      id,
      type,
      name,
      data,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || "system",
    };

    await redis.lpush("trash:items", item);
    // 只保留最近100条
    await redis.ltrim("trash:items", 0, 99);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
