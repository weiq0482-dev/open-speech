import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, SETTINGS_KEY } from "@/lib/admin-utils";

const DEFAULT_SETTINGS = { freeTrialDays: 30, freeDailyLimit: 5 };

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const settings = await redis.get<Record<string, unknown>>(SETTINGS_KEY);
    return NextResponse.json({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const body = await req.json();
    const existing = (await redis.get<Record<string, unknown>>(SETTINGS_KEY)) || DEFAULT_SETTINGS;
    const updated = { ...existing, ...body };
    await redis.set(SETTINGS_KEY, updated);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
