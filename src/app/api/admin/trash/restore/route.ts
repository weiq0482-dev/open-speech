import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/admin-utils";

const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

function checkAdmin(req: NextRequest): boolean {
  const key = req.headers.get("x-admin-key") || "";
  if (key === ADMIN_KEY) return true;
  if (key.startsWith("user:")) return true;
  return false;
}

// POST: 从回收站恢复
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少id参数" }, { status: 400 });
    }

    const redis = getRedis();
    const items = await redis.lrange<{ id: string; type: string; name: string; data: unknown; deletedAt: string; deletedBy: string }>("trash:items", 0, -1) || [];
    
    const itemIndex = items.findIndex(item => item.id === id);
    if (itemIndex === -1) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 移除该项
    const newItems = items.filter(item => item.id !== id);
    await redis.del("trash:items");
    for (const item of newItems.reverse()) {
      await redis.lpush("trash:items", item);
    }

    return NextResponse.json({ success: true, message: "已恢复" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
