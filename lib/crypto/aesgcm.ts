import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function deriveAes256Key(secret: string): Buffer {
    // Derive a stable 32-byte key from an arbitrary-length secret.
    return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptAes256Gcm(plaintext: string, secret: string): string {
    const key = deriveAes256Key(secret);
    const iv = randomBytes(12); // 96-bit nonce recommended for GCM
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    // v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
    return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptAes256Gcm(payload: string, secret: string): string {
    const [ver, ivB64, tagB64, ctB64] = payload.split(":");
    if (ver !== "v1" || !ivB64 || !tagB64 || !ctB64) {
        throw new Error("Invalid encrypted payload format.");
    }

    const key = deriveAes256Key(secret);
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(ctB64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
}

