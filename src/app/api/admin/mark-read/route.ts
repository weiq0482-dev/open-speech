import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, THREAD_PREFIX } from "@/lib/admin-utils";

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const { userId } = await req.json();
    const redis = getRedis();
    const threadKey = `${THREAD_PREFIX}${userId}`;
    const thread = await redis.get<{ messages: { from: string; read?: boolean }[] }>(threadKey);

    if (thread) {
      thread.messages = thread.messages.map((msg) =>
        msg.from === "user" ? { ...msg, read: true } : msg
      );
      await redis.set(threadKey, thread);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
