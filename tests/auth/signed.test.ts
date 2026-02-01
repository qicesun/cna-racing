import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import { createSignedValue, readSignedValue } from "@/lib/auth/signed";
import { base64UrlEncode } from "@/lib/auth/utils";

describe("lib/auth/signed", () => {
    it("createSignedValue/readSignedValue round-trip", () => {
        const secret = "x".repeat(40);
        const payload = { v: 1, hello: "world" };

        const signed = createSignedValue(payload, secret);
        expect(signed).toContain(".");

        const decoded = readSignedValue<typeof payload>(signed, secret);
        expect(decoded).toEqual(payload);
    });

    it("rejects tampering (payload)", () => {
        const secret = "x".repeat(40);
        const signed = createSignedValue({ v: 1, hello: "world" }, secret);

        const [payloadB64, sigB64] = signed.split(".");
        expect(payloadB64).toBeTruthy();
        expect(sigB64).toBeTruthy();

        const tampered = `AA${payloadB64}.${sigB64}`;
        expect(readSignedValue(tampered, secret)).toBeNull();
    });

    it("rejects tampering (signature)", () => {
        const secret = "x".repeat(40);
        const signed = createSignedValue({ v: 1 }, secret);
        const [payloadB64, sigB64] = signed.split(".");

        const tampered = `${payloadB64}.${sigB64}x`;
        expect(readSignedValue(tampered, secret)).toBeNull();
    });

    it("rejects malformed values", () => {
        const secret = "x".repeat(40);
        expect(readSignedValue(undefined, secret)).toBeNull();
        expect(readSignedValue("", secret)).toBeNull();
        expect(readSignedValue("no-dot", secret)).toBeNull();
        expect(readSignedValue("a.", secret)).toBeNull();
        expect(readSignedValue(".b", secret)).toBeNull();
    });

    it("returns null when payload decodes but JSON parsing fails", () => {
        const secret = "x".repeat(40);
        const payloadB64 = base64UrlEncode(Buffer.from("{not json", "utf8"));
        const sigB64 = base64UrlEncode(
            createHmac("sha256", secret).update(payloadB64, "utf8").digest()
        );

        const signed = `${payloadB64}.${sigB64}`;
        expect(readSignedValue(signed, secret)).toBeNull();
    });
});
