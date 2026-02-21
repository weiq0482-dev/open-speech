import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { verifyAdminKey, unauthorizedResponse } from "@/lib/admin-utils";

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const filename = formData.get("filename") as string | null;

    if (!file || !filename) {
      return NextResponse.json({ error: "缺少文件或文件名" }, { status: 400 });
    }

    // 只允许图片类型
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片文件" }, { status: 400 });
    }

    // 文件大小限制 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "图片不能超过 2MB" }, { status: 400 });
    }

    // 安全文件名（防止路径穿越）
    const ext = file.type === "image/png" ? ".png" : file.type === "image/jpeg" ? ".jpg" : file.type === "image/webp" ? ".webp" : ".png";
    const safeName = filename.replace(/[^a-zA-Z0-9\-_]/g, "") + ext;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const publicDir = join(process.cwd(), "public");
    await writeFile(join(publicDir, safeName), buffer);

    return NextResponse.json({ url: `/${safeName}`, filename: safeName });
  } catch (e) {
    console.error("[upload]", e);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
