// 设备指纹生成（浏览器端）
// 基于多种浏览器特征生成唯一标识，清缓存/重装后仍保持一致

export async function generateDeviceFingerprint(): Promise<string> {
  const components: string[] = [];

  // 1. Canvas 指纹（基于渲染引擎差异）
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = "#069";
      ctx.fillText("OpenSpeech Device FP", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("OpenSpeech Device FP", 4, 17);
      components.push(canvas.toDataURL());
    }
  } catch {}

  // 2. WebGL 渲染器信息
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
      }
    }
  } catch {}

  // 3. 屏幕特征
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
  components.push(`${window.devicePixelRatio}`);

  // 4. 系统信息
  components.push(navigator.platform || "");
  components.push(navigator.language || "");
  components.push(`${navigator.hardwareConcurrency || 0}`);
  components.push(`${(navigator as unknown as { deviceMemory?: number }).deviceMemory || 0}`);

  // 5. 时区
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "");

  // 6. 可用字体检测（简化版）
  try {
    const testFonts = ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana", "SimHei", "Microsoft YaHei"];
    const span = document.createElement("span");
    span.style.fontSize = "72px";
    span.style.position = "absolute";
    span.style.left = "-9999px";
    span.textContent = "mmmmmmmmmmlli";
    document.body.appendChild(span);

    const defaultWidth = span.offsetWidth;
    const available: string[] = [];
    for (const font of testFonts) {
      span.style.fontFamily = `"${font}", monospace`;
      if (span.offsetWidth !== defaultWidth) {
        available.push(font);
      }
    }
    document.body.removeChild(span);
    components.push(available.join(","));
  } catch {}

  // 生成 hash
  const raw = components.join("|||");
  const hash = await sha256(raw);
  return hash;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
