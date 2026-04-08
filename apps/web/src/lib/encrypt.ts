import { createCipheriv, randomBytes } from "crypto"

export function encrypt(text: string): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-char hex string")
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv
  )
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":")
}
