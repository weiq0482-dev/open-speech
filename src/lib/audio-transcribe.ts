// 音频转文字工具 - 使用阿里云 DashScope Paraformer API
// 支持传入音频 URL 或带防盗链的 URL（自动下载后上传到 DashScope 临时 OSS）

import { Redis } from "@upstash/redis";

const SETTINGS_KEY = "system_settings";

// 获取千问 API Key（与语音识别共用同一个 DashScope key）
async function getApiKey(): Promise<string> {
  try {
    const redis = new Redis({
      url: (process.env.KV_REST_API_URL || "").trim(),
      token: (process.env.KV_REST_API_TOKEN || "").trim(),
    });
    const settings = await redis.get<{ qwenApiKey?: string }>(SETTINGS_KEY);
    return settings?.qwenApiKey || "";
  } catch {
    return "";
  }
}

// 下载音频并上传到 DashScope 临时 OSS，返回 oss:// URL
// 用于处理有防盗链的音频 URL（如 B站）
async function uploadAudioToDashScope(
  apiKey: string,
  audioUrl: string,
  downloadHeaders: Record<string, string> = {}
): Promise<string> {
  // 步骤1：获取上传凭证
  const policyResp = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=paraformer-v2",
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!policyResp.ok) {
    throw new Error(`DashScope upload policy failed: ${policyResp.status}`);
  }
  const policyData = await policyResp.json();
  const { policy, signature, upload_dir, upload_host, oss_access_key_id, x_oss_object_acl, x_oss_forbid_overwrite } = policyData.data;

  // 步骤2：完整下载音频到内存（不截断，保证文件结构完整）
  const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 30MB 上限保护（DASH 纯音频通常 3-8MB/分钟）
  console.log("[DashScope Upload] Downloading audio from:", audioUrl.slice(0, 80) + "...");
  const audioResp = await fetch(audioUrl, {
    headers: downloadHeaders,
    signal: AbortSignal.timeout(120000),
  });
  if (!audioResp.ok) {
    throw new Error(`Audio download failed: ${audioResp.status}`);
  }
  // 流式读取，超过大小限制则停止（DASH 音频 moov 在头部，截断仍可解析）
  const reader = audioResp.body?.getReader();
  if (!reader) throw new Error("No response body");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalBytes += value.length;
    if (totalBytes >= MAX_AUDIO_BYTES) {
      reader.cancel();
      console.warn("[DashScope Upload] Audio truncated at", totalBytes, "bytes (limit reached)");
      break;
    }
  }
  const audioBuffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { audioBuffer.set(chunk, offset); offset += chunk.length; }
  console.log("[DashScope Upload] Downloaded audio size:", totalBytes, "bytes");

  // 步骤3：上传到 DashScope 临时 OSS
  const fileName = `audio_${Date.now()}.mp4`;
  const key = `${upload_dir}/${fileName}`;

  const formData = new FormData();
  formData.append("OSSAccessKeyId", oss_access_key_id);
  formData.append("policy", policy);
  formData.append("Signature", signature);
  formData.append("x-oss-object-acl", x_oss_object_acl);
  formData.append("x-oss-forbid-overwrite", x_oss_forbid_overwrite);
  formData.append("key", key);
  formData.append("success_action_status", "200");
  formData.append("file", new Blob([audioBuffer], { type: "audio/mp4" }), fileName);

  const uploadResp = await fetch(upload_host, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120000),
  });
  if (!uploadResp.ok && uploadResp.status !== 200) {
    throw new Error(`DashScope OSS upload failed: ${uploadResp.status}`);
  }

  // 步骤4：生成 oss:// URL
  const ossUrl = `oss://${key}`;
  console.log("[DashScope Upload] Uploaded successfully, oss URL:", ossUrl);
  return ossUrl;
}

interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
}

// 提交异步转录任务
async function submitTranscriptionTask(apiKey: string, audioUrl: string): Promise<string> {
  const isOssUrl = audioUrl.startsWith("oss://");
  const resp = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
      // oss:// URL 需要此 header 让 DashScope 解析私有 OSS 文件
      ...(isOssUrl ? { "X-DashScope-OssResourceResolve": "enable" } : {}),
    },
    body: JSON.stringify({
      model: "paraformer-v2",
      input: {
        file_urls: [audioUrl],
      },
      parameters: {
        language_hints: ["zh", "en"],
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DashScope ASR submit failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const taskId = data.output?.task_id;
  if (!taskId) {
    throw new Error("DashScope ASR: no task_id returned");
  }
  return taskId;
}

// 轮询任务状态
async function pollTranscriptionResult(apiKey: string, taskId: string, maxWaitMs = 120000): Promise<TranscriptionResult> {
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    const resp = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      throw new Error(`DashScope ASR poll failed: ${resp.status}`);
    }

    const data = await resp.json();
    const status = data.output?.task_status;

    if (status === "SUCCEEDED") {
      // 解析转录结果
      const results = data.output?.results;
      if (results && results.length > 0) {
        const transcriptionUrl = results[0].transcription_url;
        if (transcriptionUrl) {
          // 下载转录结果
          const transResp = await fetch(transcriptionUrl, { signal: AbortSignal.timeout(10000) });
          if (transResp.ok) {
            const transData = await transResp.json();
            const transcripts = transData.transcripts || [];
            let fullText = "";
            for (const t of transcripts) {
              const sentences = t.sentences || [];
              for (const s of sentences) {
                fullText += (s.text || "") + " ";
              }
            }
            return { text: fullText.trim(), language: "zh" };
          }
        }
      }
      return { text: "", language: "zh" };
    }

    if (status === "FAILED") {
      const errMsg = data.output?.message || "转录失败";
      throw new Error(`DashScope ASR failed: ${errMsg}`);
    }

    // 等待后继续轮询
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("DashScope ASR timeout");
}

// 主函数：音频 URL 转文字
// downloadHeaders: 下载音频时需要的额外 header（如 B站防盗链 Referer）
export async function transcribeAudioUrl(
  audioUrl: string,
  downloadHeaders?: Record<string, string>
): Promise<TranscriptionResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("未配置千问 API Key，无法使用语音识别");
  }

  let finalUrl = audioUrl;

  // 如果传入了 downloadHeaders，说明音频有防盗链，需要先下载再上传到 DashScope OSS
  if (downloadHeaders && Object.keys(downloadHeaders).length > 0) {
    console.log("[Audio Transcribe] 检测到防盗链，先上传到 DashScope OSS...");
    finalUrl = await uploadAudioToDashScope(apiKey, audioUrl, downloadHeaders);
  }

  console.log("[Audio Transcribe] 提交转录任务:", finalUrl.slice(0, 80) + "...");
  const taskId = await submitTranscriptionTask(apiKey, finalUrl);
  console.log("[Audio Transcribe] 任务已提交, taskId:", taskId);

  const result = await pollTranscriptionResult(apiKey, taskId);
  console.log("[Audio Transcribe] 转录完成, 文字长度:", result.text.length);
  return result;
}

// 检查是否支持音频转文字（API Key 是否已配置）
export async function isTranscriptionAvailable(): Promise<boolean> {
  const apiKey = await getApiKey();
  return !!apiKey;
}
