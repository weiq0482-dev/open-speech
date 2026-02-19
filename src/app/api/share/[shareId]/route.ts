import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

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

const NB_PREFIX = "nb:";
const NB_SHARE_PREFIX = "nb_share:";
const NB_MEMBERS_PREFIX = "nb_members:";
const NB_SRC_PREFIX = "nb_src:";
const NB_SRC_INDEX = "nb_src_index:";
const NB_STUDIO = "nb_studio:";

interface ShareConfig {
  shareId: string;
  notebookId: string;
  ownerId: string;
  access: "public" | "login-required";
  createdAt: string;
}

// GET: 通过分享链接访问笔记本
export async function GET(req: NextRequest, { params }: { params: { shareId: string } }) {
  try {
    const redis = getRedis();
    const shareId = params.shareId;
    const userId = req.nextUrl.searchParams.get("userId"); // 可选：已登录用户

    // 获取分享配置
    const share = await redis.get(`${NB_SHARE_PREFIX}${shareId}`) as ShareConfig | null;
    if (!share) {
      return NextResponse.json({ error: "分享链接无效或已过期" }, { status: 404 });
    }

    const { notebookId, ownerId, access } = share;

    // 获取笔记本基本信息
    const nb = await redis.get(`${NB_PREFIX}${ownerId}:${notebookId}`) as Record<string, unknown> | null;
    if (!nb) {
      return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
    }

    const isLoggedIn = userId && isValidUserId(userId);
    const isOwner = userId === ownerId;
    const isMember = isLoggedIn ? await redis.sismember(`${NB_MEMBERS_PREFIX}${notebookId}`, userId!) : false;

    // 权限检查
    if (access === "login-required" && !isLoggedIn) {
      // 未登录用户只能看到基本信息和 Studio 预览
      return NextResponse.json({
        notebook: {
          id: nb.id,
          title: nb.title,
          icon: nb.icon,
          sourceCount: nb.sourceCount,
        },
        access: "preview",
        requireLogin: true,
        shareId,
      });
    }

    // 已登录用户自动加入成员列表
    if (isLoggedIn && !isMember && !isOwner) {
      await redis.sadd(`${NB_MEMBERS_PREFIX}${notebookId}`, userId!);
    }

    // 获取 Studio 成果（所有人可看）
    const studioTypes = ["guide", "faq", "outline", "timeline", "concepts", "briefing"];
    const studioPipeline = redis.pipeline();
    for (const t of studioTypes) {
      studioPipeline.get(`${NB_STUDIO}${notebookId}:${t}`);
    }
    const studioResults = await studioPipeline.exec();
    const studioOutputs: Record<string, unknown> = {};
    studioTypes.forEach((t, i) => {
      if (studioResults[i]) studioOutputs[t] = studioResults[i];
    });

    // 基本响应（访客和已登录用户都能看到）
    const response: Record<string, unknown> = {
      notebook: {
        id: nb.id,
        title: nb.title,
        description: nb.description,
        icon: nb.icon,
        sourceCount: nb.sourceCount,
        ownerId,
      },
      studioOutputs,
      shareId,
      access: isLoggedIn ? "member" : "preview",
      isOwner,
      isMember: isMember || isOwner,
    };

    // 已登录用户可以看到来源列表（标题+摘要，不含全文）
    if (isLoggedIn) {
      const srcIds: string[] = (await redis.lrange(`${NB_SRC_INDEX}${notebookId}`, 0, -1)) || [];
      if (srcIds.length > 0) {
        const srcPipeline = redis.pipeline();
        for (const id of srcIds) {
          srcPipeline.get(`${NB_SRC_PREFIX}${notebookId}:${id}`);
        }
        const srcResults = await srcPipeline.exec();
        response.sources = srcResults
          .filter((r): r is Record<string, unknown> => r !== null)
          .map((s) => ({
            id: s.id,
            type: s.type,
            title: s.title,
            summary: s.summary,
            metadata: s.metadata,
            enabled: s.enabled,
            addedAt: s.addedAt,
            // 注意：不返回 content 全文，保护隐私
          }));
      } else {
        response.sources = [];
      }
    }

    const memberCount = await redis.scard(`${NB_MEMBERS_PREFIX}${notebookId}`);
    response.memberCount = memberCount;

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/share/[shareId]]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
