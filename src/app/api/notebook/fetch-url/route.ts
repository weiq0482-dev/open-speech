import { NextRequest, NextResponse } from "next/server";
import { isUrlSafe } from "@/lib/notebook-utils";

// POST: 抓取 URL 内容（服务端代理，避免 CORS）
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "缺少 URL" }, { status: 400 });
    }

    // URL 验证 + SSRF 防护
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!isUrlSafe(url)) {
        return NextResponse.json({ error: "不允许访问此地址" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "无效的 URL" }, { status: 400 });
    }

    // 抓取网页
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OpenSpeech/1.0; +https://openspeech.ai)",
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `获取失败: HTTP ${resp.status}` }, { status: 400 });
    }

    const contentType = resp.headers.get("content-type") || "";
    const html = await resp.text();

    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : parsedUrl.hostname;
    // 解码 HTML 实体
    title = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    // 提取正文文本
    let content = "";
    if (contentType.includes("text/plain")) {
      content = html;
    } else {
      // 简单 HTML 文本提取
      content = html
        // 移除 script/style 标签及内容
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        // 把块级元素换成换行
        .replace(/<(br|p|div|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n")
        // 移除所有 HTML 标签
        .replace(/<[^>]+>/g, "")
        // 解码常见 HTML 实体
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        // 清理多余空白
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    }

    // 限制大小
    content = content.slice(0, 100000);

    return NextResponse.json({
      title: title.slice(0, 200),
      content,
      url,
      wordCount: content.length,
    });
  } catch (err) {
    console.error("[POST /api/notebook/fetch-url]", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: `获取失败: ${message}` }, { status: 500 });
  }
}
