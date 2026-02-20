// ========== 视频导出工具 ==========
// 客户端 Canvas 录制方案 + 服务端 Remotion Lambda 方案

export interface ExportOptions {
  format: "mp4" | "webm";
  quality: "high" | "medium" | "low";
  fps: number;
  width: number;
  height: number;
}

export interface ExportProgress {
  phase: "preparing" | "rendering" | "encoding" | "done" | "error";
  progress: number; // 0-100
  message: string;
  downloadUrl?: string;
}

type ProgressCallback = (progress: ExportProgress) => void;

// ========== 方案1: 客户端 MediaRecorder 录制 ==========
// 录制 Remotion Player 的 canvas 输出
export async function exportViaMediaRecorder(
  canvasElement: HTMLCanvasElement,
  durationMs: number,
  onProgress: ProgressCallback,
  options?: Partial<ExportOptions>
): Promise<Blob> {
  const format = options?.format || "webm";
  const mimeType = format === "mp4" ? "video/webm" : "video/webm"; // 浏览器原生只支持 webm

  onProgress({ phase: "preparing", progress: 0, message: "准备录制..." });

  return new Promise((resolve, reject) => {
    const stream = canvasElement.captureStream(options?.fps || 30);
    const chunks: Blob[] = [];

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: options?.quality === "high" ? 8000000 : options?.quality === "low" ? 2000000 : 4000000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      onProgress({ phase: "done", progress: 100, message: "导出完成！" });
      resolve(blob);
    };

    recorder.onerror = (e) => {
      onProgress({ phase: "error", progress: 0, message: `录制失败: ${e}` });
      reject(new Error("录制失败"));
    };

    recorder.start(100); // 每100ms收集一次数据

    // 进度跟踪
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(Math.round((elapsed / durationMs) * 100), 99);
      onProgress({ phase: "rendering", progress: pct, message: `录制中... ${pct}%` });

      if (elapsed >= durationMs) {
        clearInterval(progressInterval);
        recorder.stop();
      }
    }, 200);
  });
}

// ========== 方案2: 通过 API 请求服务端渲染 ==========
export async function exportViaServer(
  notebookId: string,
  userId: string,
  onProgress: ProgressCallback
): Promise<string> {
  onProgress({ phase: "preparing", progress: 0, message: "提交渲染任务..." });

  const resp = await fetch(`/api/notebook/${notebookId}/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, action: "export_video" }),
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || "渲染任务提交失败");
  }

  const { taskId } = await resp.json();

  // 轮询任务状态
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const statusResp = await fetch(
      `/api/notebook/${notebookId}/video?userId=${userId}&taskId=${taskId}&action=export_status`
    );
    const status = await statusResp.json();

    if (status.phase === "done") {
      onProgress({ phase: "done", progress: 100, message: "渲染完成！", downloadUrl: status.downloadUrl });
      return status.downloadUrl;
    }

    if (status.phase === "error") {
      throw new Error(status.message || "渲染失败");
    }

    onProgress({
      phase: status.phase || "rendering",
      progress: status.progress || Math.min(i * 0.5, 95),
      message: status.message || "渲染中...",
    });
  }

  throw new Error("渲染超时");
}

// ========== 下载 Blob 为文件 ==========
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== 获取最佳导出配置 ==========
export function getExportConfig(ratio: "16:9" | "9:16" | "1:1", quality: "high" | "medium" | "low"): ExportOptions {
  const configs: Record<string, Record<string, { width: number; height: number }>> = {
    "16:9": { high: { width: 1920, height: 1080 }, medium: { width: 1280, height: 720 }, low: { width: 854, height: 480 } },
    "9:16": { high: { width: 1080, height: 1920 }, medium: { width: 720, height: 1280 }, low: { width: 480, height: 854 } },
    "1:1": { high: { width: 1080, height: 1080 }, medium: { width: 720, height: 720 }, low: { width: 480, height: 480 } },
  };

  const dim = configs[ratio]?.[quality] || configs["9:16"].medium;

  return {
    format: "webm",
    quality,
    fps: 30,
    ...dim,
  };
}
