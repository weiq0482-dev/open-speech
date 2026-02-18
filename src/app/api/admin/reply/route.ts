import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, THREAD_PREFIX, ALL_THREADS_KEY } from "@/lib/admin-utils";

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const { userId, message } = await req.json();
    if (!userId || !message?.trim()) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const redis = getRedis();
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: "admin",
      content: message.trim(),
      timestamp: new Date().toISOString(),
      read: true,
    };

    const threadKey = `${THREAD_PREFIX}${userId}`;
    const existing = await redis.get<{ messages: unknown[] }>(threadKey);

    const thread = {
      userId,
      messages: existing ? [...existing.messages, msg] : [msg],
      lastActivity: msg.timestamp,
    };

    await redis.set(threadKey, thread);
    await redis.sadd(ALL_THREADS_KEY, userId);

    return NextResponse.json({ success: true, message: msg });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
