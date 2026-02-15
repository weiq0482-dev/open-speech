import { NextRequest, NextResponse } from "next/server";

// 客服消息转发 API
// 支持钉钉机器人 webhook 和企业微信机器人 webhook
export async function POST(req: NextRequest) {
  try {
    const { userId, message } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: "客服通道未配置" }, { status: 500 });
    }

    const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const text = `📩 用户反馈\n用户ID: ${userId || "未知"}\n时间: ${timestamp}\n内容: ${message}`;

    // 自动识别 webhook 类型
    let body: Record<string, unknown>;
    if (webhookUrl.includes("dingtalk")) {
      // 钉钉机器人
      body = { msgtype: "text", text: { content: text } };
    } else if (webhookUrl.includes("weixin") || webhookUrl.includes("qyapi")) {
      // 企业微信机器人
      body = { msgtype: "text", text: { content: text } };
    } else {
      // 通用 JSON webhook
      body = { text, userId, message, timestamp };
    }

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error("[Contact webhook error]", resp.status, await resp.text());
      return NextResponse.json({ error: "发送失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Contact API error]", error);
    return NextResponse.json({ error: "服务异常" }, { status: 500 });
  }
}
