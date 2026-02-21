import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse } from "@/lib/admin-utils";

const ORDER_PREFIX = "payment_order:";

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const status = req.nextUrl.searchParams.get("status") || "all";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const pageSize = 20;

    // 扫描所有订单 key
    let cursor = 0;
    const orderKeys: string[] = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${ORDER_PREFIX}*`,
        count: 100,
      });
      cursor = parseInt(String(nextCursor));
      orderKeys.push(...keys);
    } while (cursor !== 0);

    // 批量获取订单数据
    const orders = await Promise.all(
      orderKeys.map((key) => redis.get<Record<string, unknown>>(key))
    );

    let filtered = orders
      .filter(Boolean)
      .map((o) => o as Record<string, unknown>)
      .filter((o) => status === "all" || o.status === status)
      .sort((a, b) => {
        const ta = new Date(String(a.createdAt || 0)).getTime();
        const tb = new Date(String(b.createdAt || 0)).getTime();
        return tb - ta;
      });

    const total = filtered.length;
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    // 统计数据
    const stats = {
      total: orders.filter(Boolean).length,
      paid: orders.filter((o) => o && (o as any).status === "paid").length,
      pending: orders.filter((o) => o && (o as any).status === "pending").length,
      totalAmount: orders
        .filter((o) => o && (o as any).status === "paid")
        .reduce((sum, o) => sum + (Number((o as any).amount) || 0), 0),
    };

    return NextResponse.json({ orders: paged, total, page, pageSize, stats });
  } catch (err) {
    console.error("[GET /api/admin/orders]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
