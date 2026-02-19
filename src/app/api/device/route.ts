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

interface DeviceRecord {
  userId: string;
  fingerprint: string;
  ip: string;
  registeredAt: string;
  lastSeen: string;
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

    // 1. 此设备已注册 → 直接返回
    const existingDevice = await redis.get<DeviceRecord>(deviceKey);
    if (existingDevice) {
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

    // 3. 全新 IP → 检查注册频率
    const today = new Date().toISOString().slice(0, 10);
    const regKey = `${DEVICE_REG_PREFIX}${ip}:${today}`;
    const regCount = await redis.get<number>(regKey);
    if ((regCount || 0) >= MAX_NEW_ACCOUNTS_PER_IP) {
      return NextResponse.json(
        { error: "今日新设备注册已达上限" },
        { status: 429 }
      );
    }

    // 4. 注册新用户
    const userId = `u_${fingerprint.slice(0, 12)}_${Date.now().toString(36)}`;
    const record: DeviceRecord = {
      userId,
      fingerprint,
      ip,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await redis.set(deviceKey, record);
    // 注册标记（供 chat API 验证 userId 真实性）
    await redis.set(`registered:${userId}`, "1");
    // IP → 指纹 映射（30天，允许 IP 变动后重新绑定）
    await redis.set(ipKey, fingerprint, { ex: 30 * 86400 });
    // 记录注册次数
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
