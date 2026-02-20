import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/admin-utils";

const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

function checkAdmin(req: NextRequest): boolean {
  const key = req.headers.get("x-admin-key") || "";
  if (key === ADMIN_KEY) return true;
  if (key.startsWith("user:")) return true;
  return false;
}

// GET: 获取访问监控数据
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const redis = getRedis();
    
    // 获取统计数据
    const stats = await redis.get<{ totalVisits: number; todayVisits: number; activeUsers: number }>("monitor:stats") || {
      totalVisits: 0,
      todayVisits: 0,
      activeUsers: 0,
    };

    // 获取最近访问日志
    const logs = await redis.lrange<{ userId: string; action: string; ip: string; time: string }>("monitor:logs", 0, 49) || [];

    return NextResponse.json({ stats, logs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 记录访问（供其他接口调用）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, action, ip } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const redis = getRedis();
    const today = new Date().toISOString().slice(0, 10);

    // 更新统计
    const stats = await redis.get<{ totalVisits: number; todayVisits: number; activeUsers: number; lastDate: string }>("monitor:stats") || {
      totalVisits: 0,
      todayVisits: 0,
      activeUsers: 0,
      lastDate: today,
    };

    // 如果是新的一天，重置今日访问
    if (stats.lastDate !== today) {
      stats.todayVisits = 0;
      stats.lastDate = today;
    }

    stats.totalVisits += 1;
    stats.todayVisits += 1;

    await redis.set("monitor:stats", stats);

    // 添加日志
    const logEntry = {
      userId,
      action,
      ip: ip || "unknown",
      time: new Date().toISOString(),
    };

    await redis.lpush("monitor:logs", logEntry);
    // 只保留最近1000条
    await redis.ltrim("monitor:logs", 0, 999);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
