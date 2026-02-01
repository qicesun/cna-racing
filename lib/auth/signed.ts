import "server-only";

import { createHmac } from "crypto";
import { base64UrlDecode, base64UrlEncode, safeEqual } from "./utils";

function signPayloadB64(payloadB64: string, secret: string): string {
    const mac = createHmac("sha256", secret).update(payloadB64, "utf8").digest();
    return base64UrlEncode(mac);
}

export function createSignedValue(payload: unknown, secret: string): string {
    const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
    const signatureB64 = signPayloadB64(payloadB64, secret);
    return `${payloadB64}.${signatureB64}`;
}

export function readSignedValue<T>(signedValue: string | undefined, secret: string): T | null {
    if (!signedValue) return null;
    const [payloadB64, signatureB64] = signedValue.split(".");
    if (!payloadB64 || !signatureB64) return null;

    const expected = signPayloadB64(payloadB64, secret);
    if (!safeEqual(expected, signatureB64)) return null;

    try {
        const json = base64UrlDecode(payloadB64).toString("utf8");
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
}

