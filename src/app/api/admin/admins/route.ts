import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse } from "@/lib/admin-utils";

const ADMIN_PREFIX = "admin:";
const ALL_ADMINS_KEY = "all_admins";

interface AdminUser {
  username: string;
  password: string; // 明文存储（内部系统，简化处理）
  role: "super" | "normal";
  permissions: string[]; // ["coupons", "messages", "users"]
  createdAt: string;
  createdBy: string;
  lastLogin?: string;
}

// GET: 获取所有管理员列表（仅超级管理员可用）
export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  // 只有超级管理员（用 ADMIN_KEY 登录）才能管理管理员
  const role = req.headers.get("x-admin-role");
  if (role !== "super") {
    return NextResponse.json({ error: "仅超级管理员可操作" }, { status: 403 });
  }

  try {
    const redis = getRedis();
    const usernames = (await redis.get<string[]>(ALL_ADMINS_KEY)) || [];

    const results = await Promise.all(
      usernames.map(u => redis.get<AdminUser>(`${ADMIN_PREFIX}${u}`).catch(() => null))
    );
    const admins = results
      .filter((d): d is AdminUser => !!d)
      .map(({ password: _pw, ...safe }) => safe);

    return NextResponse.json({ admins });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 创建 / 更新 / 删除管理员
export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  const role = req.headers.get("x-admin-role");
  if (role !== "super") {
    return NextResponse.json({ error: "仅超级管理员可操作" }, { status: 403 });
  }

  try {
    const redis = getRedis();
    const { action, username, password, permissions } = await req.json();

    if (!username || !username.trim()) {
      return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
    }

    if (action === "create") {
      if (!password || password.length < 4) {
        return NextResponse.json({ error: "密码至少 4 位" }, { status: 400 });
      }
      const existing = await redis.get(`${ADMIN_PREFIX}${username}`);
      if (existing) {
        return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
      }

      const admin: AdminUser = {
        username,
        password,
        role: "normal",
        permissions: permissions || ["coupons", "messages"],
        createdAt: new Date().toISOString(),
        createdBy: "super_admin",
      };
      await redis.set(`${ADMIN_PREFIX}${username}`, admin);

      const allAdmins = (await redis.get<string[]>(ALL_ADMINS_KEY)) || [];
      if (!allAdmins.includes(username)) {
        await redis.set(ALL_ADMINS_KEY, [...allAdmins, username]);
      }

      return NextResponse.json({ success: true, message: `管理员 ${username} 创建成功` });
    }

    if (action === "update") {
      const data = await redis.get<AdminUser>(`${ADMIN_PREFIX}${username}`);
      if (!data) {
        return NextResponse.json({ error: "管理员不存在" }, { status: 404 });
      }
      if (password && password.length >= 4) data.password = password;
      if (permissions) data.permissions = permissions;
      await redis.set(`${ADMIN_PREFIX}${username}`, data);
      return NextResponse.json({ success: true, message: `管理员 ${username} 已更新` });
    }

    if (action === "delete") {
      await redis.del(`${ADMIN_PREFIX}${username}`);
      const allAdmins = (await redis.get<string[]>(ALL_ADMINS_KEY)) || [];
      await redis.set(ALL_ADMINS_KEY, allAdmins.filter((u) => u !== username));
      return NextResponse.json({ success: true, message: `管理员 ${username} 已删除` });
    }

    return NextResponse.json({ error: "无效的 action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
