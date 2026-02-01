import "server-only";

import { timingSafeEqual } from "crypto";

export function base64UrlEncode(input: Uint8Array): string {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

export function base64UrlDecode(input: string): Buffer {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);
    return Buffer.from(padded, "base64");
}

export function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

export function sanitizeNextPath(nextParam: string | null): string {
    if (!nextParam) return "/";
    if (nextParam.length > 512) return "/";
    if (!nextParam.startsWith("/")) return "/";
    if (nextParam.startsWith("//")) return "/";
    return nextParam;
}

