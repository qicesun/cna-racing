import { describe, expect, it } from "vitest";

import { decryptAes256Gcm, encryptAes256Gcm } from "@/lib/crypto/aesgcm";

describe("lib/crypto/aesgcm", () => {
    it("round-trips plaintext", () => {
        const secret = "s".repeat(40);
        const enc = encryptAes256Gcm("hello", secret);
        expect(enc.startsWith("v1:")).toBe(true);
        expect(decryptAes256Gcm(enc, secret)).toBe("hello");
    });

    it("fails to decrypt with a different secret", () => {
        const enc = encryptAes256Gcm("hello", "s".repeat(40));
        expect(() => decryptAes256Gcm(enc, "x".repeat(40))).toThrow();
    });
});

