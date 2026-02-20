import { NextRequest, NextResponse } from "next/server";
import { getRedis, verifyAdminKey, unauthorizedResponse, SETTINGS_KEY } from "@/lib/admin-utils";

const DEFAULT_SETTINGS = { 
  freeTrialDays: 30, 
  freeDailyLimit: 5,
  modelProvider: "qwen", // "gemini" | "qwen" - 默认使用通义千问
  qwenApiKey: "",
  geminiApiKey: "",
};

// 掩码API Key，只显示前4个字符
function maskApiKey(key: string | undefined): string {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 4) return key;
  return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 4, 20));
}

export async function GET(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const settings = await redis.get<Record<string, unknown>>(SETTINGS_KEY);
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    // 返回掩码版本的API key，保护密钥安全
    return NextResponse.json({ 
      settings: {
        ...merged,
        qwenApiKey: maskApiKey(merged.qwenApiKey as string),
        geminiApiKey: maskApiKey(merged.geminiApiKey as string),
        // 同时返回是否已配置的标志
        qwenApiKeyConfigured: !!(merged.qwenApiKey && (merged.qwenApiKey as string).length > 0),
        geminiApiKeyConfigured: !!(merged.geminiApiKey && (merged.geminiApiKey as string).length > 0),
      }
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminKey(req)) return unauthorizedResponse();

  try {
    const redis = getRedis();
    const body = await req.json();
    const existing = (await redis.get<Record<string, unknown>>(SETTINGS_KEY)) || DEFAULT_SETTINGS;
    
    // 如果传入的API key是掩码格式（包含•字符）或为空，则保留原来的值
    const isMaskedOrEmpty = (val: unknown) => !val || (typeof val === 'string' && val.includes('•'));
    
    const updated = { 
      ...existing, 
      ...body,
      // 保留原有的API key，除非用户输入了新的完整key
      qwenApiKey: isMaskedOrEmpty(body.qwenApiKey) ? existing.qwenApiKey : body.qwenApiKey,
      geminiApiKey: isMaskedOrEmpty(body.geminiApiKey) ? existing.geminiApiKey : body.geminiApiKey,
    };
    
    await redis.set(SETTINGS_KEY, updated);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
