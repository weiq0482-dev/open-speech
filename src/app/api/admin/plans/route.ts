import { NextRequest, NextResponse } from "next/server";
import { verifyAdminKey, unauthorizedResponse } from "@/lib/admin-utils";
import { getPlans, savePlans, type PlanConfig } from "@/lib/quota-store";

// GET: 获取所有卡种
export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();
  try {
    const plans = await getPlans();
    return NextResponse.json({ plans });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 保存卡种列表（整体覆盖）
export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();
  try {
    const body = await req.json();
    const plans: PlanConfig[] = body.plans;

    if (!Array.isArray(plans) || plans.length === 0) {
      return NextResponse.json({ error: "至少需要一种卡" }, { status: 400 });
    }

    // 校验每个卡种的必填字段
    for (const p of plans) {
      if (!p.id || !p.label || !p.chatQuota || !p.durationDays) {
        return NextResponse.json({ error: `卡种 "${p.label || p.id}" 缺少必填字段` }, { status: 400 });
      }
    }

    // 确保 ID 唯一
    const ids = plans.map(p => p.id);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "卡种 ID 不能重复" }, { status: 400 });
    }

    await savePlans(plans);
    return NextResponse.json({ success: true, plans });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
