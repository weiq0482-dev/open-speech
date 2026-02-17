import { NextRequest, NextResponse } from "next/server";
import { saveVerifyCode } from "@/lib/auth-store";
import { Resend } from "resend";

// 邮箱格式校验
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// IP 级别频率限制（防止恶意批量发送）
const ipCooldown = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }

    // IP 频率限制：同一 IP 每 30 秒最多发 1 次
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const lastSend = ipCooldown.get(ip) || 0;
    if (Date.now() - lastSend < 30000) {
      return NextResponse.json({ error: "发送太频繁，请稍后再试" }, { status: 429 });
    }

    // 保存验证码到 Redis
    const result = await saveVerifyCode(email);
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 429 });
    }

    // 发送邮件
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error("[send-code] RESEND_API_KEY 未配置");
      return NextResponse.json({ error: "邮件服务未配置，请联系管理员" }, { status: 500 });
    }

    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "OpenSpeech <onboarding@resend.dev>",
      to: email.toLowerCase().trim(),
      subject: "OpenSpeech 验证码",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">OpenSpeech 验证码</h2>
          <p style="color: #666; font-size: 14px; margin-bottom: 24px;">您正在登录/注册 OpenSpeech，验证码如下：</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${result.code}</span>
          </div>
          <p style="color: #999; font-size: 12px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
          <p style="color: #999; font-size: 12px;">如果您没有请求此验证码，请忽略此邮件。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #bbb; font-size: 11px;">OpenSpeech AI 助手</p>
        </div>
      `,
    });

    if (error) {
      console.error("[send-code] Resend error:", error);
      return NextResponse.json({ error: "邮件发送失败，请稍后重试" }, { status: 500 });
    }

    // 记录 IP 冷却
    ipCooldown.set(ip, Date.now());

    return NextResponse.json({ success: true, message: "验证码已发送到您的邮箱" });
  } catch (err) {
    console.error("[POST /api/auth/send-code]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
