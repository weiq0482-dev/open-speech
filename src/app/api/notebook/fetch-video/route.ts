import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { transcribeAudioUrl, isTranscriptionAvailable } from "@/lib/audio-transcribe";
import ytdl from "@distube/ytdl-core";

// 视频平台识别
function detectPlatform(url: string): "youtube" | "bilibili" | "douyin" | "xiaohongshu" | "unknown" {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("bilibili.com") || u.includes("b23.tv")) return "bilibili";
  if (u.includes("douyin.com") || u.includes("iesdouyin.com")) return "douyin";
  if (u.includes("xiaohongshu.com") || u.includes("xhslink.com")) return "xiaohongshu";
  return "unknown";
}

// 提取 YouTube 视频 ID
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 提取 B站视频 ID
function extractBilibiliId(url: string): { bvid?: string; aid?: string } | null {
  const bvMatch = url.match(/BV[a-zA-Z0-9]+/i);
  if (bvMatch) return { bvid: bvMatch[0] };
  const avMatch = url.match(/av(\d+)/i);
  if (avMatch) return { aid: avMatch[1] };
  return null;
}

// 带超时的 Promise 包装
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
}

// 获取 YouTube 字幕/转录文本（方案A：youtube-transcript 库）
async function fetchYouTubeTranscriptLib(videoId: string): Promise<string> {
  try {
    let transcript = null;
    
    // 先尝试无语言偏好（最快），再试中文
    try {
      transcript = await withTimeout(YoutubeTranscript.fetchTranscript(videoId), 5000, "YT-default");
    } catch {
      try {
        transcript = await withTimeout(YoutubeTranscript.fetchTranscript(videoId, { lang: "zh-Hans" }), 3000, "YT-zh");
      } catch { /* 忽略 */ }
    }
    
    if (transcript && transcript.length > 0) {
      const MAX_TRANSCRIPT_LENGTH = 100000;
      let text = "";
      for (const item of transcript) {
        const line = item.text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        if (!line) continue;
        text += line + " ";
        if (text.length > MAX_TRANSCRIPT_LENGTH) break;
      }
      return text.trim();
    }
  } catch (err) {
    console.warn("[YouTube Transcript Lib]", err instanceof Error ? err.message : err);
  }
  return "";
}

// 获取 YouTube 字幕（方案C：从页面提取 continuation token + Innertube get_transcript API）
async function fetchYouTubeTranscriptInnertube(videoId: string): Promise<string> {
  try {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    // Step 1: 获取页面 HTML，提取 ytInitialData 中的 transcript continuation params
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageResp.ok) {
      console.warn("[YouTube Innertube] Page fetch failed:", pageResp.status);
      return "";
    }
    const pageBuf = await pageResp.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(pageBuf);

    // 提取 INNERTUBE_API_KEY
    const keyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    const apiKey = keyMatch?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

    // 提取 client version
    const verMatch = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
    const clientVersion = verMatch?.[1] || "2.20250101.00.00";

    // 提取 visitor data (用于认证)
    const visitorMatch = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);
    const visitorData = visitorMatch?.[1] || "";

    // 从 engagementPanels 提取 transcript 的 continuation params
    const paramsMatch = html.match(/"serializedShareEntity"\s*:\s*"([^"]+)"[\s\S]*?"getTranscriptEndpoint"\s*:\s*\{[^}]*"params"\s*:\s*"([^"]+)"/);
    let transcriptParams = "";
    if (paramsMatch) {
      transcriptParams = paramsMatch[2];
    } else {
      // 备用：直接搜索 getTranscriptEndpoint params
      const altMatch = html.match(/"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/);
      if (altMatch) {
        transcriptParams = altMatch[1];
      }
    }

    if (!transcriptParams) {
      console.warn("[YouTube Innertube] No transcript params found in page");
      return "";
    }

    console.log("[YouTube Innertube] Found params, apiKey:", apiKey.slice(0, 15) + "..., version:", clientVersion);

    // Step 2: 调用 get_transcript API
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": ua,
    };
    if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;

    const resp = await fetch(
      `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion,
              hl: "zh-CN",
            },
          },
          params: transcriptParams,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!resp.ok) {
      const errBuf = await resp.arrayBuffer();
      const errText = new TextDecoder("utf-8").decode(errBuf);
      console.warn("[YouTube Innertube] API failed:", resp.status, errText.slice(0, 200));
      return "";
    }

    const buf = await resp.arrayBuffer();
    const data = JSON.parse(new TextDecoder("utf-8").decode(buf));

    // Step 3: 从响应中提取文本（递归搜索所有可能的文本字段）
    const text = extractAllTranscriptText(data);
    if (text.length > 50) {
      console.log("[YouTube Innertube] Extraction succeeded, length:", text.length);
      return text;
    }

    console.warn("[YouTube Innertube] Could not extract text from response, keys:", Object.keys(data).join(", "));
    return "";
  } catch (err) {
    console.warn("[YouTube Innertube]", err instanceof Error ? err.message : err);
  }
  return "";
}

// 从 innertube get_transcript 响应中提取所有转录文本
function extractAllTranscriptText(data: any): string {
  const MAX_LENGTH = 100000;
  const texts: string[] = [];

  function walk(obj: any, depth: number): void {
    if (depth > 20 || !obj || texts.join(" ").length > MAX_LENGTH) return;

    if (typeof obj !== "object") return;

    // 模式1: transcriptSegmentRenderer -> snippet -> runs
    if (obj.transcriptSegmentRenderer) {
      const runs = obj.transcriptSegmentRenderer?.snippet?.runs;
      if (Array.isArray(runs)) {
        const t = runs.map((r: any) => r.text || "").join("");
        if (t.trim()) texts.push(t.trim());
        return;
      }
    }

    // 模式2: transcriptCueRenderer -> cue -> simpleText
    if (obj.transcriptCueRenderer) {
      const t = obj.transcriptCueRenderer?.cue?.simpleText;
      if (typeof t === "string" && t.trim()) {
        texts.push(t.trim());
        return;
      }
    }

    // 模式3: formattedText -> runs
    if (obj.formattedText?.runs) {
      const t = obj.formattedText.runs.map((r: any) => r.text || "").join("");
      if (t.trim()) texts.push(t.trim());
      return;
    }

    // 递归
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) walk(item, depth + 1);
      } else if (typeof val === "object" && val !== null) {
        walk(val, depth + 1);
      }
    }
  }

  walk(data, 0);
  return texts.join(" ").slice(0, MAX_LENGTH).trim();
}

// 获取 YouTube 字幕（方案B：直接从页面 HTML 精确提取 captionTracks，不解析整个巨大JSON）
async function fetchYouTubeTranscriptDirect(videoId: string): Promise<string> {
  try {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": ua,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!pageResp.ok) {
      console.warn("[YouTube Direct] Page fetch failed:", pageResp.status);
      return "";
    }

    // 提取 Set-Cookie 用于后续 timedtext 请求
    const cookies = pageResp.headers.getSetCookie?.() || [];
    const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");
    console.log("[YouTube Direct] Got", cookies.length, "cookies from page");

    // 用 arrayBuffer + TextDecoder 确保 UTF-8 编码正确
    const buf = await pageResp.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf);

    // 精确提取 captionTracks JSON 数组（不解析整个 ytInitialPlayerResponse）
    const captionMarker = '"captionTracks":';
    const capIdx = html.indexOf(captionMarker);
    if (capIdx === -1) {
      console.warn("[YouTube Direct] No captionTracks found in HTML");
      return "";
    }

    // 从 captionTracks 标记后提取 JSON 数组（"captionTracks":[ 总长约17字符）
    const arrStart = html.indexOf("[", capIdx);
    if (arrStart === -1 || arrStart - capIdx > 30) {
      console.warn("[YouTube Direct] No array start after captionTracks, distance:", arrStart - capIdx);
      return "";
    }

    // 括号计数法提取数组（数组内容较小，不会遇到大JSON问题）
    let depth = 0;
    let arrEnd = arrStart;
    let inString = false;
    let escape = false;
    for (let i = arrStart; i < html.length && i < arrStart + 50000; i++) {
      const ch = html[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      if (depth === 0) { arrEnd = i + 1; break; }
    }

    const captionsJson = html.slice(arrStart, arrEnd);
    let captions: Array<{ baseUrl: string; languageCode: string; name?: { simpleText?: string } }>;
    try {
      captions = JSON.parse(captionsJson);
    } catch (e) {
      console.warn("[YouTube Direct] Failed to parse captionTracks JSON:", (e as Error).message);
      return "";
    }

    if (!captions || captions.length === 0) {
      console.warn("[YouTube Direct] Empty captionTracks");
      return "";
    }

    console.log("[YouTube Direct] Found", captions.length, "caption tracks:", captions.map(t => t.languageCode).join(", "));

    // 优先中文，其次英文，最后任意
    const langPriority = ["zh", "zh-Hans", "zh-CN", "zh-TW", "en", "en-US"];
    let selectedTrack = null;
    for (const lang of langPriority) {
      selectedTrack = captions.find(t =>
        t.languageCode === lang || t.languageCode.startsWith(lang.split("-")[0])
      );
      if (selectedTrack) break;
    }
    if (!selectedTrack) selectedTrack = captions[0];

    let captionUrl = selectedTrack.baseUrl;
    if (!captionUrl) {
      console.warn("[YouTube Direct] No caption baseUrl");
      return "";
    }
    // 尝试多种格式获取字幕（json3 和 默认 XML）
    const formats = ["", "&fmt=json3"]; // 先默认XML，再json3
    const capHeaders: Record<string, string> = {
      "User-Agent": ua,
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Referer": "https://www.youtube.com/",
    };
    if (cookieStr) capHeaders["Cookie"] = cookieStr;

    for (const fmt of formats) {
      const url = captionUrl + (captionUrl.includes("?") ? fmt : "?" + fmt.slice(1));
      console.log("[YouTube Direct] Trying caption URL:", url.slice(0, 150));

      try {
        const capResp = await fetch(url, { headers: capHeaders, signal: AbortSignal.timeout(10000) });
        if (!capResp.ok) {
          console.warn("[YouTube Direct] Caption fetch failed:", capResp.status);
          continue;
        }

        const capBuf = await capResp.arrayBuffer();
        const capText = new TextDecoder("utf-8").decode(capBuf);
        console.log("[YouTube Direct] Response length:", capText.length, "format:", fmt || "default XML");

        if (capText.length < 10) continue;

        // 尝试 JSON 解析
        if (capText.trimStart().startsWith("{")) {
          try {
            const capData = JSON.parse(capText);
            const events = capData.events || [];
            let text = "";
            for (const event of events) {
              for (const seg of (event.segs || [])) {
                const line = (seg.utf8 || "").replace(/\n/g, " ").trim();
                if (line) text += line + " ";
                if (text.length > 100000) break;
              }
              if (text.length > 100000) break;
            }
            if (text.trim().length > 50) {
              console.log("[YouTube Direct] JSON extraction succeeded, length:", text.length);
              return text.trim();
            }
          } catch {}
        }

        // XML 格式提取
        const xmlTexts = capText.match(/<text[^>]*>([^<]*)<\/text>/g);
        if (xmlTexts && xmlTexts.length > 0) {
          let xmlText = "";
          for (const tag of xmlTexts) {
            const content = tag.replace(/<[^>]+>/g, "")
              .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
              .replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
            if (content) xmlText += content + " ";
            if (xmlText.length > 100000) break;
          }
          if (xmlText.trim().length > 50) {
            console.log("[YouTube Direct] XML extraction succeeded, length:", xmlText.length);
            return xmlText.trim();
          }
        }
      } catch (e) {
        console.warn("[YouTube Direct] Format", fmt || "XML", "error:", (e as Error).message);
      }
    }

    console.warn("[YouTube Direct] All caption formats failed");
    return "";
  } catch (err) {
    console.warn("[YouTube Direct]", err instanceof Error ? err.message : err);
  }
  return "";
}

// 综合获取 YouTube 字幕（依次尝试多种方案）
async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  // 方案A：使用 youtube-transcript 库（最快，通常 2-5 秒内返回结果或失败）
  console.log("[YouTube Transcript] Trying library method for:", videoId);
  let text = await fetchYouTubeTranscriptLib(videoId);
  if (text.length > 50) {
    console.log("[YouTube Transcript] Library method succeeded, length:", text.length);
    return text;
  }

  // 注意：Innertube API（方案B）和 timedtext（方案C）在测试中均被 YouTube 封锁，暂时跳过以加快响应
  // 如果未来 YouTube 政策变化，可重新启用 fetchYouTubeTranscriptInnertube / fetchYouTubeTranscriptDirect
  console.warn("[YouTube Transcript] Library method failed for video:", videoId);
  return "";
}

// 从 YouTube 获取音频流 URL（使用 @distube/ytdl-core，内置签名解密）
// 注意：googlevideo.com URL 有防盗链，DashScope 无法直接下载，暂时禁用
async function fetchYouTubeAudioUrl(_videoId: string): Promise<string> {
  // YouTube 音频 URL 包含防盗链签名，DashScope 无法直接访问
  // 需要代理中转或本地下载后上传，当前环境不支持，跳过
  console.warn("[YouTube Audio] Skipped: googlevideo URLs have hotlink protection, DashScope cannot download them");
  return "";
}

// 从 B站 API 获取音频流 URL
// 返回 { url, headers } 供下载使用
async function fetchBilibiliAudioUrl(bvid: string, cid: number): Promise<{ url: string; headers: Record<string, string> } | null> {
  const biliHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: "https://www.bilibili.com/",
  };

  try {
    // 优先 DASH 纯音频（文件小，约 3-5MB/分钟，moov box 在文件头部）
    const resp = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fnver=0&fourk=1`,
      { headers: biliHeaders, signal: AbortSignal.timeout(10000) }
    );
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const data = JSON.parse(new TextDecoder("utf-8").decode(buf));
      if (data.code === 0) {
        const audioList = data.data?.dash?.audio;
        if (audioList && audioList.length > 0) {
          // 取最低质量（文件最小，转录效果一样）
          const sorted = [...audioList].sort((a: any, b: any) => (a.bandwidth || 0) - (b.bandwidth || 0));
          const audioUrl = sorted[0].baseUrl || sorted[0].base_url;
          if (audioUrl) {
            console.log("[Bilibili Audio] Found DASH audio URL, bandwidth:", sorted[0].bandwidth);
            return { url: audioUrl, headers: biliHeaders };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Bilibili Audio] DASH format failed:", err instanceof Error ? err.message : err);
  }

  try {
    // 备用：普通 MP4 格式（音视频合并，文件较大）
    const resp = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=1&fnver=0&fourk=0&qn=16`,
      { headers: biliHeaders, signal: AbortSignal.timeout(10000) }
    );
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const data = JSON.parse(new TextDecoder("utf-8").decode(buf));
      if (data.code === 0) {
        const durl = data.data?.durl;
        if (durl && durl.length > 0 && durl[0].url) {
          console.log("[Bilibili Audio] Found MP4 durl URL (fallback)");
          return { url: durl[0].url, headers: biliHeaders };
        }
      }
    }
  } catch (err) {
    console.warn("[Bilibili Audio] MP4 format failed:", err instanceof Error ? err.message : err);
  }

  console.warn("[Bilibili Audio] No audio URL found");
  return null;
}

// 通用音频转录兜底（字幕失败时调用）
// downloadHeaders: 下载音频时需要的防盗链 header
async function transcribeVideoAudio(
  audioUrl: string,
  platform: string,
  downloadHeaders?: Record<string, string>
): Promise<string> {
  try {
    const available = await isTranscriptionAvailable();
    if (!available) {
      console.warn("[Audio Transcribe] API Key 未配置，跳过音频转录");
      return "";
    }
    console.log(`[Audio Transcribe] 开始转录 ${platform} 音频...`);
    const result = await transcribeAudioUrl(audioUrl, downloadHeaders);
    if (result.text && result.text.length > 50) {
      console.log(`[Audio Transcribe] 转录成功，长度: ${result.text.length}`);
      return result.text;
    }
  } catch (err) {
    console.warn("[Audio Transcribe] 转录失败:", err instanceof Error ? err.message : err);
  }
  return "";
}

// 解析 YouTube 视频信息（使用 oEmbed + 字幕，字幕失败时音频转录兜底）
async function fetchYouTubeInfo(videoId: string): Promise<{ title: string; description: string; author: string; transcript: string }> {
  // 并行获取元数据和字幕
  const [metaResult, transcript] = await Promise.all([
    (async () => {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const resp = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const data = JSON.parse(new TextDecoder("utf-8").decode(buf));
          return {
            title: data.title || "YouTube 视频",
            description: `作者: ${data.author_name || "未知"}`,
            author: data.author_name || "",
          };
        }
      } catch {}
      return { title: "YouTube 视频", description: "", author: "" };
    })(),
    fetchYouTubeTranscript(videoId),
  ]);

  // 字幕失败 → 音频转录兜底
  if (!transcript || transcript.length < 50) {
    console.log("[YouTube] 字幕提取失败，尝试音频转录...");
    const audioUrl = await fetchYouTubeAudioUrl(videoId);
    if (audioUrl) {
      const audioTranscript = await transcribeVideoAudio(audioUrl, "YouTube");
      if (audioTranscript) {
        return { ...metaResult, transcript: audioTranscript };
      }
    } else {
      console.warn("[YouTube] 无法获取音频 URL，跳过音频转录");
    }
  }
  
  return { ...metaResult, transcript };
}

// 获取 B站 CC 字幕
async function fetchBilibiliSubtitle(bvid: string, cid?: number): Promise<string> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://www.bilibili.com/",
    };

    // 如果没有 cid，先从视频信息获取
    if (!cid) {
      const infoResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (infoResp.ok) {
        const buf = await infoResp.arrayBuffer();
        const infoJson = JSON.parse(new TextDecoder("utf-8").decode(buf));
        cid = infoJson.data?.cid;
        console.log("[Bilibili] Got cid:", cid, "for bvid:", bvid);
      }
    }
    if (!cid) {
      console.warn("[Bilibili Subtitle] No cid found for:", bvid);
      return "";
    }

    // 获取字幕列表（注意：部分视频需要 Cookie 才能获取字幕）
    const subtitleResp = await fetch(
      `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
      { headers, signal: AbortSignal.timeout(10000) }
    );
    if (!subtitleResp.ok) {
      console.warn("[Bilibili Subtitle] Player API failed:", subtitleResp.status);
      return "";
    }

    const subBuf = await subtitleResp.arrayBuffer();
    const subtitleJson = JSON.parse(new TextDecoder("utf-8").decode(subBuf));
    const subtitleList = subtitleJson.data?.subtitle?.subtitles || [];
    console.log("[Bilibili Subtitle] Found", subtitleList.length, "subtitle tracks for cid:", cid);

    if (subtitleList.length === 0) {
      // 尝试备用方案：从视频页面HTML提取字幕信息
      console.log("[Bilibili Subtitle] No subtitles from API, trying page HTML...");
      try {
        const pageResp = await fetch(`https://www.bilibili.com/video/${bvid}`, {
          headers: { ...headers, "Accept-Language": "zh-CN,zh;q=0.9" },
          signal: AbortSignal.timeout(10000),
        });
        if (pageResp.ok) {
          const pageBuf = await pageResp.arrayBuffer();
          const pageHtml = new TextDecoder("utf-8").decode(pageBuf);
          // 从 __NEXT_DATA__ 或 window.__playinfo__ 提取字幕
          const subtitleMatch = pageHtml.match(/"subtitle_url"\s*:\s*"([^"]+)"/);
          if (subtitleMatch) {
            let subUrl = subtitleMatch[1].replace(/\\u002F/g, "/");
            if (subUrl.startsWith("//")) subUrl = "https:" + subUrl;
            console.log("[Bilibili Subtitle] Found subtitle URL from HTML:", subUrl);
            const subResp = await fetch(subUrl, { headers, signal: AbortSignal.timeout(10000) });
            if (subResp.ok) {
              const subData = await subResp.json();
              const body = subData.body || [];
              if (body.length > 0) {
                let text = "";
                for (const item of body) {
                  const line = (item.content || "").trim();
                  if (!line) continue;
                  text += line + " ";
                  if (text.length > 100000) break;
                }
                return text.trim();
              }
            }
          }
        }
      } catch (e) {
        console.warn("[Bilibili Subtitle HTML]", e instanceof Error ? e.message : e);
      }
      return "";
    }

    // 优先中文字幕
    const zhSub = subtitleList.find((s: { lan: string }) => s.lan.startsWith("zh")) || subtitleList[0];
    let subUrl = zhSub.subtitle_url;
    if (subUrl.startsWith("//")) subUrl = "https:" + subUrl;

    // 下载字幕 JSON
    const subResp = await fetch(subUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!subResp.ok) return "";

    const subData = await subResp.json();
    const body = subData.body || [];
    if (body.length === 0) return "";

    const MAX_LENGTH = 100000;
    let text = "";
    for (const item of body) {
      const line = (item.content || "").trim();
      if (!line) continue;
      text += line + " ";
      if (text.length > MAX_LENGTH) break;
    }
    return text.trim();
  } catch (err) {
    console.warn("[Bilibili Subtitle]", err instanceof Error ? err.message : err);
  }
  return "";
}

// 解析 B站视频信息（含字幕，字幕失败时音频转录兜底）
async function fetchBilibiliInfo(id: { bvid?: string; aid?: string }): Promise<{ title: string; description: string; author: string; transcript: string }> {
  try {
    const apiUrl = id.bvid
      ? `https://api.bilibili.com/x/web-interface/view?bvid=${id.bvid}`
      : `https://api.bilibili.com/x/web-interface/view?aid=${id.aid}`;
    
    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com/",
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const json = JSON.parse(new TextDecoder("utf-8").decode(buf));
      if (json.code === 0 && json.data) {
        const { title, desc, owner, bvid, cid } = json.data;
        // 先尝试 CC 字幕
        const transcript = await fetchBilibiliSubtitle(bvid, cid);

        // 字幕失败 → 音频转录兜底
        if (!transcript || transcript.length < 50) {
          console.log("[Bilibili] 字幕提取失败，尝试音频转录...");
          const audioResult = await fetchBilibiliAudioUrl(bvid, cid);
          if (audioResult) {
            const audioTranscript = await transcribeVideoAudio(audioResult.url, "B站", audioResult.headers);
            if (audioTranscript) {
              return {
                title: title || "B站视频",
                description: desc || "",
                author: owner?.name || "",
                transcript: audioTranscript,
              };
            }
          } else {
            console.warn("[Bilibili] 无法获取音频 URL，跳过音频转录");
          }
        }

        return {
          title: title || "B站视频",
          description: desc || "",
          author: owner?.name || "",
          transcript,
        };
      }
    }
  } catch {}
  return { title: "B站视频", description: "", author: "", transcript: "" };
}

// 通用网页解析（抖音、小红书等）
async function fetchPageInfo(url: string, platform: string): Promise<{ title: string; description: string; author: string }> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!resp.ok) {
      return { title: `${platform}视频`, description: "", author: "" };
    }

    const html = await resp.text();

    // 提取 title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : `${platform}视频`;
    title = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

    // 提取 meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    // 提取作者（从 og:site_name 或其他元数据）
    const authorMatch = html.match(/<meta[^>]*property=["']og:author["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
    const author = authorMatch ? authorMatch[1].trim() : "";

    return { title, description, author };
  } catch {}
  return { title: `${platform}视频`, description: "", author: "" };
}

// 构建视频来源内容（包含字幕全文，供 notebook AI 分析）
function buildVideoContent(videoInfo: { title: string; description: string; author: string; platform: string; url: string; transcript?: string }): string {
  const parts: string[] = [];
  parts.push(`【${videoInfo.title}】`);
  parts.push(``);
  parts.push(`作者: ${videoInfo.author || "未知"}`);
  parts.push(`平台: ${videoInfo.platform}`);
  parts.push(`链接: ${videoInfo.url}`);
  
  if (videoInfo.description) {
    parts.push(``);
    parts.push(`描述: ${videoInfo.description}`);
  }
  
  if (videoInfo.transcript) {
    parts.push(``);
    parts.push(`===== 视频字幕/转录文本 =====`);
    parts.push(videoInfo.transcript);
    parts.push(`===== 字幕结束 =====`);
  } else {
    parts.push(``);
    parts.push(`⚠️ 未能获取到该视频的字幕/转录文本（已尝试字幕提取和音频识别）。`);
    parts.push(`建议：在视频页面手动复制字幕文本，粘贴到知识库中。`);
  }
  
  return parts.join("\n");
}

// POST: 解析视频 URL
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "缺少视频 URL" }, { status: 400 });
    }

    // 检测平台
    const platform = detectPlatform(url);
    if (platform === "unknown") {
      return NextResponse.json({ error: "暂不支持此视频平台，目前支持: YouTube、B站、抖音、小红书" }, { status: 400 });
    }

    const platformNames: Record<string, string> = {
      youtube: "YouTube",
      bilibili: "B站",
      douyin: "抖音",
      xiaohongshu: "小红书",
    };

    let videoInfo: { title: string; description: string; author: string; transcript?: string };

    // 根据平台获取视频信息
    switch (platform) {
      case "youtube": {
        const videoId = extractYouTubeId(url);
        if (!videoId) {
          return NextResponse.json({ error: "无法解析 YouTube 视频 ID" }, { status: 400 });
        }
        videoInfo = await fetchYouTubeInfo(videoId);
        break;
      }
      case "bilibili": {
        const id = extractBilibiliId(url);
        if (!id) {
          return NextResponse.json({ error: "无法解析 B站视频 ID" }, { status: 400 });
        }
        videoInfo = await fetchBilibiliInfo(id);
        break;
      }
      case "douyin":
      case "xiaohongshu":
      default:
        videoInfo = await fetchPageInfo(url, platformNames[platform]);
        break;
    }

    // 构建完整内容（含字幕全文）
    const content = buildVideoContent({
      ...videoInfo,
      platform: platformNames[platform],
      url,
    });

    const hasTranscript = !!(videoInfo.transcript && videoInfo.transcript.length > 0);

    return NextResponse.json({
      title: videoInfo.title.slice(0, 200),
      content,
      platform: platformNames[platform],
      author: videoInfo.author,
      url,
      wordCount: content.length,
      hasTranscript,
      transcriptLength: videoInfo.transcript?.length || 0,
    });
  } catch (err) {
    console.error("[POST /api/notebook/fetch-video]", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: `解析失败: ${message}` }, { status: 500 });
  }
}
