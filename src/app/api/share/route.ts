import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSystemSettingsPublic } from "@/lib/quota-store";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
  }
  return _redis;
}

function isValidUserId(id: string): boolean {
  return /^u_[a-f0-9]{12}_[a-z0-9]+$/.test(id) || /^em_[a-f0-9]{16}$/.test(id);
}

// [安全] 验证 userId 对应的是真实注册用户（设备注册或邮箱认证）
async function isRealUser(redis: Redis, userId: string): Promise<boolean> {
  // 方式1：检查注册标记（/api/device 注册时写入）
  const marker = await redis.get(`registered:${userId}`);
  if (String(marker) === "1") return true;
  // 方式2：检查是否有 quota 记录（只有真实使用过的用户才有）
  const quota = await redis.get(`quota:${userId}`);
  if (quota) return true;
  return false;
}

const SHARE_PREFIX = "share:";
const SHARE_REWARD_PREFIX = "share_reward:";
const QUOTA_PREFIX = "quota:";
const CLAIM_LOCK_PREFIX = "share_claimed:";   // 原子锁：防竞态重复领取
const CLAIM_GLOBAL_PREFIX = "share_used:";    // 全局：每人只能领取一次
const CLAIM_IP_PREFIX = "share_ip:";          // IP 速率限制

// 分享奖励配置（从后台动态读取）
async function getShareReward() {
  const settings = await getSystemSettingsPublic();
  return {
    chatQuota: settings.shareRewardChat || 29,
    imageQuota: settings.shareRewardImage || 9,
  };
}

interface ShareData {
  userId: string;
  code: string;
  createdAt: string;
  claimedBy: string[]; // 已通过此分享链接领取的用户
  totalRewards: number; // 累计获得的奖励次数
}

// GET: 获取用户的分享码 / 检查分享码有效性
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    const code = req.nextUrl.searchParams.get("code");

    const redis = getRedis();

    // 查询分享码信息（用于新用户验证分享链接）
    if (code) {
      const shareData = await redis.get<ShareData>(`${SHARE_PREFIX}${code}`);
      if (!shareData) {
        return NextResponse.json({ valid: false });
      }
      return NextResponse.json({ valid: true, sharerUserId: shareData.userId });
    }

    // 获取用户的分享码
    if (!userId || !isValidUserId(userId)) {
      return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
    }

    // 查找用户已有的分享码
    const existingCode = await redis.get<string>(`${SHARE_REWARD_PREFIX}${userId}`);
    if (existingCode) {
      const shareData = await redis.get<ShareData>(`${SHARE_PREFIX}${existingCode}`);
      return NextResponse.json({
        code: existingCode,
        stats: shareData ? {
          claimedCount: shareData.claimedBy?.length || 0,
          totalRewards: shareData.totalRewards || 0,
        } : { claimedCount: 0, totalRewards: 0 },
      });
    }

    return NextResponse.json({ code: null });
  } catch (err) {
    console.error("[GET /api/share]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST: 生成分享码 / 领取分享奖励
export async function POST(req: NextRequest) {
  try {
    const { action, userId, shareCode } = await req.json();
    const redis = getRedis();

    // ========================
    //   生成分享码
    // ========================
    if (action === "generate") {
      if (!userId || !isValidUserId(userId)) {
        return NextResponse.json({ error: "无效的用户标识" }, { status: 400 });
      }

      // [安全修复 #1] 只有真实注册用户才能生成分享码
      if (!(await isRealUser(redis, userId))) {
        return NextResponse.json({ error: "用户未注册" }, { status: 403 });
      }

      // 检查是否已有分享码
      const existing = await redis.get<string>(`${SHARE_REWARD_PREFIX}${userId}`);
      if (existing) {
        return NextResponse.json({ code: existing });
      }

      // 生成唯一分享码（6位字母数字，确保无碰撞）
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        const exists = await redis.get(`${SHARE_PREFIX}${code}`);
        if (!exists) break;
      }

      const shareData: ShareData = {
        userId,
        code,
        createdAt: new Date().toISOString(),
        claimedBy: [],
        totalRewards: 0,
      };

      await redis.set(`${SHARE_PREFIX}${code}`, shareData);
      await redis.set(`${SHARE_REWARD_PREFIX}${userId}`, code);

      return NextResponse.json({ code });
    }

    // ========================
    //   领取分享奖励
    // ========================
    if (action === "claim") {
      if (!userId || !isValidUserId(userId) || !shareCode) {
        return NextResponse.json({ error: "参数错误" }, { status: 400 });
      }

      // 校验分享码格式（防注入）
      if (!/^[A-Z0-9]{6}$/.test(shareCode)) {
        return NextResponse.json({ error: "分享码格式无效" }, { status: 400 });
      }

      // [安全修复 #1] 验证领取者是真实注册用户（阻止伪造 userId 刷奖励）
      if (!(await isRealUser(redis, userId))) {
        return NextResponse.json({ error: "用户未注册" }, { status: 403 });
      }

      // [安全修复 #3] IP 速率限制（每个 IP 每天最多领取 5 次）
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const today = new Date().toISOString().slice(0, 10);
      const ipKey = `${CLAIM_IP_PREFIX}${ip}:${today}`;
      const ipCount = await redis.get<number>(ipKey);
      if ((ipCount || 0) >= 5) {
        return NextResponse.json({ error: "领取频率过快，请明天再试" }, { status: 429 });
      }

      // [安全修复 #5] 全局限制：每个用户只能通过分享链接领取一次奖励
      const globalKey = `${CLAIM_GLOBAL_PREFIX}${userId}`;
      const alreadyUsed = await redis.get<string>(globalKey);
      if (alreadyUsed) {
        return NextResponse.json({ error: "你已经领取过分享奖励了" }, { status: 400 });
      }

      const shareData = await redis.get<ShareData>(`${SHARE_PREFIX}${shareCode}`);
      if (!shareData) {
        return NextResponse.json({ error: "分享码无效" }, { status: 400 });
      }

      // 不能给自己加奖励
      if (shareData.userId === userId) {
        return NextResponse.json({ error: "不能使用自己的分享链接" }, { status: 400 });
      }

      // 每个分享码最多奖励 100 人（防滥用）
      if ((shareData.claimedBy?.length || 0) >= 100) {
        return NextResponse.json({ error: "此分享链接的奖励次数已达上限" }, { status: 400 });
      }

      // [安全修复 #4] 原子锁防竞态：用 SETNX 确保同一 userId+shareCode 只能成功一次
      const lockKey = `${CLAIM_LOCK_PREFIX}${shareCode}:${userId}`;
      const lockAcquired = await redis.setnx(lockKey, "1");
      if (!lockAcquired) {
        return NextResponse.json({ error: "已经通过此分享链接获得过奖励" }, { status: 400 });
      }
      // 锁 30 天后自动清理
      await redis.expire(lockKey, 30 * 86400);

      // 标记该用户已全局领取过（SETNX 原子操作）
      const globalLock = await redis.setnx(globalKey, shareCode);
      if (!globalLock) {
        // 极端情况：在上一步和这一步之间，该用户通过另一个分享码领取了
        return NextResponse.json({ error: "你已经领取过分享奖励了" }, { status: 400 });
      }
      await redis.expire(globalKey, 365 * 86400);

      // 从后台读取奖励配置
      const reward = await getShareReward();

      // 给指定用户加额度的通用函数
      const addRewardToUser = async (targetUserId: string) => {
        let quota = await redis.get<any>(`${QUOTA_PREFIX}${targetUserId}`);
        if (!quota) {
          quota = { plan: "free", chatRemaining: 0, imageRemaining: 0, dailyFreeUsed: 0, dailyFreeDate: new Date().toISOString().slice(0, 10) };
        }
        if (quota.plan !== "free") {
          quota.chatRemaining = (quota.chatRemaining || 0) + reward.chatQuota;
          quota.imageRemaining = (quota.imageRemaining || 0) + reward.imageQuota;
        } else {
          quota.plan = "trial";
          quota.chatRemaining = (quota.chatRemaining || 0) + reward.chatQuota;
          quota.imageRemaining = (quota.imageRemaining || 0) + reward.imageQuota;
          if (!quota.expiresAt) {
            const exp = new Date();
            exp.setDate(exp.getDate() + 30);
            quota.expiresAt = exp.toISOString();
          }
        }
        await redis.set(`${QUOTA_PREFIX}${targetUserId}`, quota);
      };

      // 给分享者加额度
      await addRewardToUser(shareData.userId);

      // 给新用户也加额度（被邀请者奖励：同等额度）
      await addRewardToUser(userId);

      // 更新分享数据
      shareData.claimedBy = [...(shareData.claimedBy || []), userId];
      shareData.totalRewards = (shareData.totalRewards || 0) + 1;
      await redis.set(`${SHARE_PREFIX}${shareCode}`, shareData);

      // 记录 IP 领取次数（原子递增）
      const newIpCount = await redis.incr(ipKey);
      if (newIpCount === 1) await redis.expire(ipKey, 86400);

      console.log(`[SHARE] claim success: claimer=${userId}, sharer=${shareData.userId}, code=${shareCode}, ip=${ip}`);

      return NextResponse.json({
        success: true,
        message: `奖励已发放！对话 ${reward.chatQuota} 次 + 生图 ${reward.imageQuota} 次`,
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/share]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
