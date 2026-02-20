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
const IP_DEVICE_PREFIX = "ip_device:";
const DEVICE_REG_PREFIX = "device_reg:";
const ACCOUNT_PREFIX = "account:";

interface DeviceRecord {
  userId: string;
  fingerprint: string;
  ip: string;
  registeredAt: string;
  lastSeen: string;
  emailBound?: boolean; // 是否已绑定邮箱
}

// 每个 IP 每天最多注册 3 个全新账号
const MAX_NEW_ACCOUNTS_PER_IP = 3;

// POST: 注册/验证设备
// 策略：同一 IP 下的新设备绑定到该 IP 已有账号（共享额度，防一人多号薅羊毛）
export async function POST(req: NextRequest) {
  try {
    const { fingerprint } = await req.json();

    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 16) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    let redis: ReturnType<typeof getRedis>;
    try {
      redis = getRedis();
      // 3秒超时测试 Redis 连接（Upstash 用 HTTP，网络不通时 fetch 会无限挂起）
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis ping timeout")), 3000)),
      ]);
    } catch (redisErr) {
      console.error("[POST /api/device] Redis 连接失败:", redisErr);
      // Redis 不可用时，用指纹生成一个临时 userId 让用户能先用
      const fallbackId = `u_${fingerprint.slice(0, 12)}_${Date.now().toString(36)}`;
      return NextResponse.json({ userId: fallbackId, isNew: true, offline: true });
    }

    const deviceKey = `${DEVICE_PREFIX}${fingerprint}`;
    const ipKey = `${IP_DEVICE_PREFIX}${ip}`;

    // 1. 此设备已注册 → 检查是否已绑定邮箱
    const existingDevice = await redis.get<DeviceRecord>(deviceKey);
    if (existingDevice) {
      // 检查该用户是否已绑定邮箱
      const account = await redis.get<{ email?: string }>(`${ACCOUNT_PREFIX}${existingDevice.userId}`);
      if (!account?.email && !existingDevice.emailBound) {
        return NextResponse.json({
          error: "请先使用邮箱登录绑定账号",
          needEmailBind: true,
        }, { status: 403 });
      }
      existingDevice.lastSeen = new Date().toISOString();
      await redis.set(deviceKey, existingDevice);
      return NextResponse.json({
        userId: existingDevice.userId,
        isNew: false,
      });
    }

    // 2. 此 IP 下已有其他设备 → 绑定到同一账号（防同一人多设备薅额度）
    const existingIpFingerprint = await redis.get<string>(ipKey);
    if (existingIpFingerprint && existingIpFingerprint !== fingerprint) {
      const linkedDevice = await redis.get<DeviceRecord>(`${DEVICE_PREFIX}${existingIpFingerprint}`);
      if (linkedDevice) {
        // 新设备也注册一条记录，但 userId 沿用已有的
        const record: DeviceRecord = {
          userId: linkedDevice.userId,
          fingerprint,
          ip,
          registeredAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        };
        await redis.set(deviceKey, record);
        return NextResponse.json({
          userId: linkedDevice.userId,
          isNew: false,
          shared: true,
        });
      }
    }

    // 3. 新设备必须先使用邮箱登录
    // 设备登录只是快捷方式，首次必须用邮箱验证
    return NextResponse.json({
      error: "首次使用请通过邮箱登录",
      needEmailBind: true,
      isNew: true,
    }, { status: 403 });
  } catch (err) {
    console.error("[POST /api/device]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
