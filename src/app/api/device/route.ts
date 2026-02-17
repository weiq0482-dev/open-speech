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
const IP_PREFIX = "ip_device:";

interface DeviceRecord {
  userId: string;
  fingerprint: string;
  ip: string;
  registeredAt: string;
  lastSeen: string;
}

// POST: 注册/验证设备
export async function POST(req: NextRequest) {
  try {
    const { fingerprint } = await req.json();

    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 16) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }

    // 获取客户端 IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const redis = getRedis();
    const deviceKey = `${DEVICE_PREFIX}${fingerprint}`;
    const ipKey = `${IP_PREFIX}${ip}`;

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

    // 2. 检查此 IP 是否已有其他设备注册
    const existingIpDevice = await redis.get<string>(ipKey);
    if (existingIpDevice && existingIpDevice !== fingerprint) {
      // 此 IP 已注册了另一台设备
      // 返回已注册设备的 userId（允许访问，但绑定到同一个账户）
      const linkedDevice = await redis.get<DeviceRecord>(`${DEVICE_PREFIX}${existingIpDevice}`);
      if (linkedDevice) {
        return NextResponse.json({
          userId: linkedDevice.userId,
          isNew: false,
          shared: true,
        });
      }
    }

    // 3. 新设备注册
    const userId = `u_${fingerprint.slice(0, 12)}_${Date.now().toString(36)}`;
    const record: DeviceRecord = {
      userId,
      fingerprint,
      ip,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await redis.set(deviceKey, record);
    // 绑定 IP → 设备指纹（30天过期，允许 IP 变动后重新绑定）
    await redis.set(ipKey, fingerprint, { ex: 30 * 86400 });

    return NextResponse.json({
      userId,
      isNew: true,
    });
  } catch (err) {
    console.error("[POST /api/device]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
