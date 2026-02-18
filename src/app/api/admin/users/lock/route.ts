import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse } from "@/lib/admin-utils";

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const { userId, reason } = await req.json();
    if (!userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    const redis = getRedis();
    await redis.set(`locked:${userId}`, reason || "异常使用");
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
