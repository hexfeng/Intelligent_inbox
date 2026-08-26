import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function encryptSecret(value: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [nonce, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string, keyBase64: string): string {
  const [noncePart, tagPart, encryptedPart] = value.split(".");
  if (!noncePart || !tagPart || !encryptedPart) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyBase64, "base64"),
    Buffer.from(noncePart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
