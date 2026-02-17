import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return redisClient;
}

const SITE_CONFIG_KEY = "site_config";

export interface SiteConfig {
  douyinQrUrl: string;
  douyinAccount: string;
  douyinDesc: string;
  wechatQrUrl: string;
  wechatGroupName: string;
  wechatDesc: string;
  contactWechatId: string;
  contactQrUrl: string;
}

const DEFAULT_CONFIG: SiteConfig = {
  douyinQrUrl: "/douyin-qr.png",
  douyinAccount: "arch8288",
  douyinDesc: "免费体验卡 · 教程 · 功能更新",
  wechatQrUrl: "/wechat-qr.png",
  wechatGroupName: "Open-speech 超级梦想家",
  wechatDesc: "微信扫码 · 把想法变成现实",
  contactWechatId: "jryg8686",
  contactQrUrl: "/wechat-qr.png",
};

// GET: 前端读取站点配置
export async function GET() {
  try {
    const redis = getRedis();
    const config = await redis.get<SiteConfig>(SITE_CONFIG_KEY);
    return NextResponse.json({ config: { ...DEFAULT_CONFIG, ...config } });
  } catch {
    return NextResponse.json({ config: DEFAULT_CONFIG });
  }
}
