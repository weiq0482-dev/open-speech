import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, THREAD_PREFIX } from "@/lib/admin-utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const { userId } = await params;
    const redis = getRedis();
    const thread = await redis.get<{ messages: unknown[] }>(`${THREAD_PREFIX}${userId}`);
    return NextResponse.json({ messages: thread?.messages || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
