import { NextRequest, NextResponse } from "next/server";
import { verifyCode } from "@/lib/auth-store";

export async function POST(req: NextRequest) {
  try {
    const { email, code, currentDeviceUserId } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "请输入邮箱和验证码" }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ error: "验证码格式错误（6位数字）" }, { status: 400 });
    }

    const result = await verifyCode(email, code, currentDeviceUserId);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      token: result.token,
      userId: result.userId,
      isNew: result.isNew,
    });
  } catch (err) {
    console.error("[POST /api/auth/verify]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
