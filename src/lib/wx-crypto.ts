import crypto from "crypto";

export class WXBizMsgCrypt {
  private token: string;
  private aesKey: Buffer;
  private iv: Buffer;
  private corpId: string;

  constructor(token: string, encodingAESKey: string, corpId: string) {
    this.token = token;
    this.corpId = corpId;
    this.aesKey = Buffer.from(encodingAESKey + "=", "base64");
    this.iv = this.aesKey.subarray(0, 16);
  }

  getSignature(timestamp: string, nonce: string, encrypt: string): string {
    const arr = [this.token, timestamp, nonce, encrypt].sort();
    return crypto.createHash("sha1").update(arr.join("")).digest("hex");
  }

  decrypt(encrypted: string): { message: string; corpId: string } {
    const decipher = crypto.createDecipheriv("aes-256-cbc", this.aesKey, this.iv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);

    // Remove PKCS#7 padding (block size 32)
    const pad = decrypted[decrypted.length - 1];
    if (pad > 0 && pad <= 32) {
      decrypted = decrypted.subarray(0, decrypted.length - pad);
    }

    // Skip 16 random bytes
    const content = decrypted.subarray(16);
    // Read message length (4 bytes, big-endian)
    const msgLen = content.readUInt32BE(0);
    const message = content.subarray(4, 4 + msgLen).toString("utf-8");
    const receivedCorpId = content.subarray(4 + msgLen).toString("utf-8");

    return { message, corpId: receivedCorpId };
  }

  verifyURL(msgSignature: string, timestamp: string, nonce: string, echostr: string): string | null {
    const signature = this.getSignature(timestamp, nonce, echostr);
    if (signature !== msgSignature) {
      console.error("[WXCrypt] signature mismatch:", signature, "vs", msgSignature);
      return null;
    }
    const { message, corpId } = this.decrypt(echostr);
    if (corpId !== this.corpId) {
      console.error("[WXCrypt] corpId mismatch:", corpId, "vs", this.corpId);
      return null;
    }
    return message;
  }
}
