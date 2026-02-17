import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAccountByEmail } from "@/lib/auth-store";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    }

    const account = await getAccountByEmail(payload.email);
    if (!account) {
      return NextResponse.json({ error: "账户不存在" }, { status: 404 });
    }

    return NextResponse.json({
      userId: account.userId,
      email: account.email,
      createdAt: account.createdAt,
      lastLogin: account.lastLogin,
    });
  } catch (err) {
    console.error("[GET /api/auth/me]", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
