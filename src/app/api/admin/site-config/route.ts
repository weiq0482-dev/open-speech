import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, SITE_CONFIG_KEY } from "@/lib/admin-utils";

const DEFAULT_SITE_CONFIG = {
  douyinQrUrl: "/douyin-qr.png",
  douyinAccount: "arch8288",
  douyinDesc: "免费体验卡 · 教程 · 功能更新",
  wechatQrUrl: "/wechat-qr.png",
  wechatGroupName: "Open-speech 超级梦想家",
  wechatDesc: "微信扫码 · 把想法变成现实",
  contactWechatId: "jryg8686",
  contactQrUrl: "/wechat-qr.png",
};

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const config = (await redis.get<Record<string, unknown>>(SITE_CONFIG_KEY)) || {};
    return NextResponse.json({ config: { ...DEFAULT_SITE_CONFIG, ...config } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const body = await req.json();
    const existing = (await redis.get<Record<string, unknown>>(SITE_CONFIG_KEY)) || {};
    const updated = { ...existing, ...body };
    await redis.set(SITE_CONFIG_KEY, updated);
    return NextResponse.json({ success: true, config: { ...DEFAULT_SITE_CONFIG, ...updated } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
