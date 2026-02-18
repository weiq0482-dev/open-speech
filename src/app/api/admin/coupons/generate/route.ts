import { NextRequest, NextResponse } from "next/server";
import { verifyAdminKey, unauthorizedResponse } from "@/lib/admin-utils";
import { generateCoupons } from "@/lib/quota-store";

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const { plan = "trial", count = 5 } = await req.json();
    if (!["trial", "monthly", "quarterly"].includes(plan)) {
      return NextResponse.json({ error: "无效的套餐类型" }, { status: 400 });
    }

    const num = Math.min(Math.max(1, count), 50);
    const codes = await generateCoupons(plan, num);

    return NextResponse.json({ success: true, codes, plan });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
