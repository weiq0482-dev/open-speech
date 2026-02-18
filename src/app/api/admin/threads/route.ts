import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, THREAD_PREFIX, getThreadUserIds } from "@/lib/admin-utils";

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const allUserIds = await getThreadUserIds();
    const threads: Record<string, unknown>[] = [];

    for (const userId of allUserIds) {
      const thread = await redis.get<{ userId: string; messages: { from: string; read?: boolean; content: string }[]; lastActivity: string }>(`${THREAD_PREFIX}${userId}`);
      if (thread) {
        const unread = thread.messages.filter((m) => m.from === "user" && !m.read).length;
        threads.push({ ...thread, unread });
      }
    }

    threads.sort((a, b) =>
      new Date(b.lastActivity as string).getTime() - new Date(a.lastActivity as string).getTime()
    );

    return NextResponse.json({ threads });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
