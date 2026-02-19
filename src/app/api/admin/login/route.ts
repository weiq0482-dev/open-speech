import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/admin-utils";

const ADMIN_PREFIX = "admin:";
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

interface AdminUser {
  username: string;
  password: string;
  role: "super" | "normal";
  permissions: string[];
  createdAt: string;
  createdBy: string;
  lastLogin?: string;
}

// POST: 管理员登录
// body: { key } 或 { username, password }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 方式 1：超级管理员用 ADMIN_KEY 登录
    if (body.key) {
      if (body.key.trim() === ADMIN_KEY) {
        return NextResponse.json({
          success: true,
          admin: {
            username: "super_admin",
            role: "super",
            permissions: ["coupons", "messages", "users", "settings", "admins"],
          },
        });
      }
      return NextResponse.json({ error: "密钥错误" }, { status: 401 });
    }

    // 方式 2：普通管理员用用户名+密码登录
    if (body.username && body.password) {
      const redis = getRedis();
      const data = await redis.get<AdminUser>(`${ADMIN_PREFIX}${body.username}`);
      if (!data || data.password !== body.password) {
        return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
      }

      // 更新最后登录时间
      data.lastLogin = new Date().toISOString();
      await redis.set(`${ADMIN_PREFIX}${body.username}`, data);

      return NextResponse.json({
        success: true,
        admin: {
          username: data.username,
          role: data.role,
          permissions: data.permissions,
        },
      });
    }

    return NextResponse.json({ error: "请提供密钥或用户名密码" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
