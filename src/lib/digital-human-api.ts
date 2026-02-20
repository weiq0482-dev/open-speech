// ========== 数字人 API 对接层 ==========
// 支持多个数字人服务商，统一接口
// 当前预留接口，后续对接具体服务商

export interface DigitalHumanConfig {
  provider: "heygen" | "aliyun" | "tencent" | "local";
  apiKey?: string;
  avatarId?: string;       // 服务商提供的数字人ID
  customPhotoUrl?: string; // 用户上传的形象照URL
}

export interface DigitalHumanRequest {
  script: string;          // 配音文字
  audioUrl?: string;       // 已生成的配音音频URL
  avatarConfig: DigitalHumanConfig;
  ratio: "16:9" | "9:16" | "1:1";
  background?: string;     // 背景类型
  style?: "formal" | "casual" | "cartoon";
}

export interface DigitalHumanResult {
  videoUrl: string;        // 生成的数字人视频URL
  duration: number;        // 时长（秒）
  status: "success" | "failed" | "processing";
  taskId?: string;
}

// ========== HeyGen 对接（国际） ==========
export async function generateWithHeyGen(req: DigitalHumanRequest): Promise<DigitalHumanResult> {
  const apiKey = req.avatarConfig.apiKey;
  if (!apiKey) throw new Error("HeyGen API Key 未配置");

  // HeyGen API v2: https://docs.heygen.com/reference/create-an-avatar-video-v2
  const resp = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: req.avatarConfig.customPhotoUrl ? "talking_photo" : "avatar",
          ...(req.avatarConfig.customPhotoUrl
            ? { talking_photo_url: req.avatarConfig.customPhotoUrl }
            : { avatar_id: req.avatarConfig.avatarId || "default" }),
        },
        voice: {
          type: "audio",
          audio_url: req.audioUrl,
        },
        background: {
          type: "color",
          value: "#0f0f1a",
        },
      }],
      dimension: {
        width: req.ratio === "9:16" ? 1080 : req.ratio === "1:1" ? 1080 : 1920,
        height: req.ratio === "9:16" ? 1920 : req.ratio === "1:1" ? 1080 : 1080,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`HeyGen error: ${resp.status} - ${err}`);
  }

  const data = await resp.json();
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error("HeyGen 视频生成提交失败");

  // 轮询等待结果
  return pollHeyGenResult(apiKey, videoId);
}

async function pollHeyGenResult(apiKey: string, videoId: string): Promise<DigitalHumanResult> {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const resp = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!resp.ok) continue;
    const data = await resp.json();

    if (data.data?.status === "completed") {
      return {
        videoUrl: data.data.video_url || "",
        duration: data.data.duration || 0,
        status: "success",
        taskId: videoId,
      };
    }

    if (data.data?.status === "failed") {
      return { videoUrl: "", duration: 0, status: "failed", taskId: videoId };
    }
  }

  return { videoUrl: "", duration: 0, status: "processing", taskId: videoId };
}

// ========== 阿里云数字人（国内） ==========
export async function generateWithAliyun(req: DigitalHumanRequest): Promise<DigitalHumanResult> {
  // 预留接口：阿里云虚拟数字人 API
  // https://help.aliyun.com/document_detail/China specific digital human API
  console.log("[DigitalHuman] 阿里云数字人接口待对接", req.script.slice(0, 50));
  return {
    videoUrl: "",
    duration: 0,
    status: "failed",
    taskId: "",
  };
}

// ========== 腾讯智影（国内） ==========
export async function generateWithTencent(req: DigitalHumanRequest): Promise<DigitalHumanResult> {
  // 预留接口：腾讯智影数字人 API
  console.log("[DigitalHuman] 腾讯智影接口待对接", req.script.slice(0, 50));
  return {
    videoUrl: "",
    duration: 0,
    status: "failed",
    taskId: "",
  };
}

// ========== 统一调度入口 ==========
export async function generateDigitalHumanVideo(req: DigitalHumanRequest): Promise<DigitalHumanResult> {
  switch (req.avatarConfig.provider) {
    case "heygen":
      return generateWithHeyGen(req);
    case "aliyun":
      return generateWithAliyun(req);
    case "tencent":
      return generateWithTencent(req);
    default:
      throw new Error(`不支持的数字人服务商: ${req.avatarConfig.provider}`);
  }
}

// 获取可用的数字人服务商列表
export function getAvailableProviders(): Array<{
  id: string;
  name: string;
  status: "active" | "coming_soon";
  costPerMinute: string;
}> {
  return [
    { id: "heygen", name: "HeyGen", status: "active", costPerMinute: "~$0.5/分钟" },
    { id: "aliyun", name: "阿里云数字人", status: "coming_soon", costPerMinute: "~¥2/分钟" },
    { id: "tencent", name: "腾讯智影", status: "coming_soon", costPerMinute: "~¥1.5/分钟" },
  ];
}
