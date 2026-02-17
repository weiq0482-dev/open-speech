import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// Redis 客户端（延迟初始化）
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

const DEVICE_PREFIX = "device:";
const DEVICE_REG_PREFIX = "device_reg:"; // IP 注册频率限制

interface DeviceRecord {
  userId: string;
  fingerprint: string;
  registeredAt: string;
  lastSeen: string;
}

// 每个 IP 每天最多注册 3 个新设备（已注册的不算）
const MAX_NEW_DEVICES_PER_IP = 3;

// POST: 注册/验证设备（每个设备指纹独立用户，不做 IP 绑定）
export async function POST(req: NextRequest) {
  try {
    const { fingerprint } = await req.json();

    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 16) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }

    const redis = getRedis();
    const deviceKey = `${DEVICE_PREFIX}${fingerprint}`;

    // 1. 检查此设备是否已注册
    const existingDevice = await redis.get<DeviceRecord>(deviceKey);
    if (existingDevice) {
      // 已注册设备，更新最后活跃时间
      existingDevice.lastSeen = new Date().toISOString();
      await redis.set(deviceKey, existingDevice);
      return NextResponse.json({
        userId: existingDevice.userId,
        isNew: false,
      });
    }

    // 2. 新设备注册 → 检查 IP 注册频率
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const today = new Date().toISOString().slice(0, 10);
    const regKey = `${DEVICE_REG_PREFIX}${ip}:${today}`;
    const regCount = await redis.get<number>(regKey);
    if ((regCount || 0) >= MAX_NEW_DEVICES_PER_IP) {
      return NextResponse.json(
        { error: "今日新设备注册已达上限" },
        { status: 429 }
      );
    }

    // 3. 新设备 → 新用户
    const userId = `u_${fingerprint.slice(0, 12)}_${Date.now().toString(36)}`;
    const record: DeviceRecord = {
      userId,
      fingerprint,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await redis.set(deviceKey, record);
    // 记录 IP 注册次数
    const newCount = await redis.incr(regKey);
    if (newCount === 1) await redis.expire(regKey, 86400);

    return NextResponse.json({
      userId,
      isNew: true,
    });
  } catch (err) {
    console.error("[POST /api/device]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
