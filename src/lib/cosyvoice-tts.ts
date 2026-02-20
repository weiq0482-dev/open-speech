// ========== CosyVoice TTS 高品质配音 ==========
// 阿里云 DashScope CosyVoice API
// 支持：预置声音 / 声音克隆 / 情感控制

export interface TTSOptions {
  text: string;
  voice?: string;        // 预置声音ID
  cloneVoiceUrl?: string; // 声音克隆：用户上传的音频URL
  speed?: number;         // 语速 0.5-2.0，默认1.0
  emotion?: "neutral" | "happy" | "sad" | "angry" | "calm";
}

export interface TTSResult {
  audioUrl: string;       // 生成的音频URL
  duration: number;       // 时长（秒）
}

// CosyVoice 预置声音列表
export const COSYVOICE_VOICES = [
  { id: "longxiaochun", name: "龙小淳", gender: "female", style: "温柔知性", recommended: true },
  { id: "longlaotie", name: "龙老铁", gender: "male", style: "成熟稳重", recommended: true },
  { id: "longshu", name: "龙叔", gender: "male", style: "磁性低沉", recommended: false },
  { id: "longxiaoxia", name: "龙小夏", gender: "female", style: "活泼甜美", recommended: false },
  { id: "longyue", name: "龙悦", gender: "female", style: "新闻播报", recommended: false },
  { id: "longcheng", name: "龙城", gender: "male", style: "新闻播报", recommended: false },
] as const;

// 获取 DashScope API Key
async function getApiKey(): Promise<string> {
  // 优先环境变量，其次从 Redis 系统设置读取
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY;

  const { getRedis } = await import("@/lib/notebook-utils");
  const redis = getRedis();
  const settings = await redis.get<{ qwenApiKey?: string }>("system_settings");
  return settings?.qwenApiKey || "";
}

// ========== 方案1: CosyVoice 合成语音（流式） ==========
export async function synthesizeSpeech(opts: TTSOptions): Promise<TTSResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("未配置 DashScope API Key");

  const model = opts.cloneVoiceUrl ? "cosyvoice-clone-v1" : "cosyvoice-v1";
  const voice = opts.voice || "longxiaochun";

  const requestBody: Record<string, unknown> = {
    model,
    input: {
      text: opts.text,
    },
    parameters: {
      voice: opts.cloneVoiceUrl ? undefined : voice,
      speed: opts.speed ?? 1.0,
      format: "mp3",
      sample_rate: 22050,
    },
  };

  // 声音克隆模式
  if (opts.cloneVoiceUrl) {
    requestBody.input = {
      ...requestBody.input as object,
      voice_clone_url: opts.cloneVoiceUrl,
    };
  }

  const resp = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-DashScope-Async": "enable", // 异步任务
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`CosyVoice API error: ${resp.status} - ${err}`);
  }

  const data = await resp.json();
  const taskId = data.output?.task_id;
  if (!taskId) throw new Error("CosyVoice 任务提交失败");

  // 轮询等待结果
  return pollTaskResult(apiKey, taskId);
}

// 轮询任务结果
async function pollTaskResult(apiKey: string, taskId: string): Promise<TTSResult> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const resp = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!resp.ok) continue;
    const data = await resp.json();
    const status = data.output?.task_status;

    if (status === "SUCCEEDED") {
      const audioUrl = data.output?.results?.[0]?.url || "";
      // 估算时长：中文约 4 字/秒
      const textLen = data.usage?.input_tokens || 0;
      const duration = Math.max(textLen / 4, 1);
      return { audioUrl, duration };
    }

    if (status === "FAILED") {
      throw new Error(`CosyVoice 生成失败: ${data.output?.message || "未知错误"}`);
    }
  }

  throw new Error("CosyVoice 生成超时");
}

// ========== 方案2: 分段合成（长文本拆分） ==========
export async function synthesizeLongText(
  segments: Array<{ text: string; speaker?: string }>,
  opts: { voice?: string; cloneVoiceUrl?: string; speed?: number }
): Promise<Array<TTSResult & { index: number }>> {
  const results: Array<TTSResult & { index: number }> = [];

  // 串行合成（避免并发限流）
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const result = await synthesizeSpeech({
      text: seg.text,
      voice: opts.voice,
      cloneVoiceUrl: opts.cloneVoiceUrl,
      speed: opts.speed,
    });
    results.push({ ...result, index: i });
  }

  return results;
}

// ========== 声音克隆：上传声音样本 ==========
export async function uploadVoiceSample(audioBuffer: Buffer, fileName: string): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("未配置 DashScope API Key");

  // 使用 DashScope 文件上传 API
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audioBuffer)]), fileName);
  formData.append("purpose", "voice_clone");

  const resp = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    }
  );

  if (!resp.ok) throw new Error(`声音样本上传失败: ${resp.status}`);
  const data = await resp.json();
  return data.id || data.url || "";
}

// 检查 CosyVoice 是否可用
export function isCosyVoiceAvailable(): boolean {
  return !!(process.env.DASHSCOPE_API_KEY);
}
