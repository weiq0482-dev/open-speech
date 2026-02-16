import { NextRequest, NextResponse } from "next/server";
import { WXBizMsgCrypt } from "@/lib/wx-crypto";
import { addMessage, getAllThreads } from "@/lib/message-store";

const TOKEN = process.env.WECOM_TOKEN || "";
const ENCODING_AES_KEY = process.env.WECOM_ENCODING_AES_KEY || "";
const CORP_ID = process.env.WECOM_CORP_ID || "";

function getWxCrypt() {
  return new WXBizMsgCrypt(TOKEN, ENCODING_AES_KEY, CORP_ID);
}

// GET: 企业微信回调 URL 验证
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const msg_signature = searchParams.get("msg_signature") || "";
  const timestamp = searchParams.get("timestamp") || "";
  const nonce = searchParams.get("nonce") || "";
  const echostr = searchParams.get("echostr") || "";

  console.log("[WeCom callback] GET verification:", { msg_signature, timestamp, nonce, echostr: echostr.slice(0, 20) + "..." });

  const wxCrypt = getWxCrypt();
  const result = wxCrypt.verifyURL(msg_signature, timestamp, nonce, echostr);

  if (result) {
    console.log("[WeCom callback] Verification OK");
    return new NextResponse(result, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.error("[WeCom callback] Verification FAILED");
  return new NextResponse("verification failed", { status: 403 });
}

// POST: 接收企业微信消息
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const msg_signature = searchParams.get("msg_signature") || "";
  const timestamp = searchParams.get("timestamp") || "";
  const nonce = searchParams.get("nonce") || "";

  const body = await req.text();
  console.log("[WeCom callback] POST message received");

  // 解析 XML 获取 Encrypt
  const encryptMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
  if (!encryptMatch) {
    console.error("[WeCom callback] No Encrypt in XML");
    return new NextResponse("invalid xml", { status: 400 });
  }

  const encrypt = encryptMatch[1];
  const wxCrypt = getWxCrypt();

  // 验证签名
  const signature = wxCrypt.getSignature(timestamp, nonce, encrypt);
  if (signature !== msg_signature) {
    console.error("[WeCom callback] POST signature mismatch");
    return new NextResponse("signature mismatch", { status: 403 });
  }

  // 解密消息
  try {
    const { message } = wxCrypt.decrypt(encrypt);
    console.log("[WeCom callback] Decrypted message XML:", message.slice(0, 200));

    // 解析消息内容
    const msgTypeMatch = message.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/);
    const contentMatch = message.match(/<Content><!\[CDATA\[([\s\S]*?)\]\]><\/Content>/);

    if (msgTypeMatch && msgTypeMatch[1] === "text" && contentMatch) {
      const content = contentMatch[1];
      console.log("[WeCom callback] Text message:", content);

      // 路由回复到用户
      // 格式1: "用户ID前8位 回复内容"  → 回复指定用户
      // 格式2: 直接输入内容           → 回复最近活跃的用户
      const threads = getAllThreads();
      let targetUserId: string | null = null;
      let replyContent = content;

      const match = content.match(/^([a-f0-9]{8})\s+([\s\S]+)/);
      if (match) {
        const prefix = match[1];
        const found = threads.find((t) => t.userId.startsWith(prefix));
        if (found) {
          targetUserId = found.userId;
          replyContent = match[2];
        }
      }

      // 没指定用户则回复最近活跃的
      if (!targetUserId && threads.length > 0) {
        targetUserId = threads[0].userId;
      }

      if (targetUserId && replyContent.trim()) {
        addMessage(targetUserId, "admin", replyContent.trim());
        console.log("[WeCom callback] Reply saved for user:", targetUserId.slice(0, 8));
      } else {
        console.log("[WeCom callback] No target user found");
      }
    }
  } catch (err) {
    console.error("[WeCom callback] Decrypt error:", err);
  }

  return new NextResponse("success", { status: 200 });
}
