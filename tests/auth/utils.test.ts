import { describe, expect, it } from "vitest";

import { base64UrlDecode, base64UrlEncode, safeEqual, sanitizeNextPath } from "@/lib/auth/utils";

describe("lib/auth/utils", () => {
    it("base64UrlEncode/base64UrlDecode round-trip", () => {
        const original = Buffer.from("hello world /+=", "utf8");
        const encoded = base64UrlEncode(original);

        // URL-safe + no padding
        expect(encoded).not.toMatch(/[+/=]/);

        const decoded = base64UrlDecode(encoded);
        expect(decoded.toString("utf8")).toBe(original.toString("utf8"));
    });

    it("safeEqual returns true only for identical strings", () => {
        expect(safeEqual("abc", "abc")).toBe(true);
        expect(safeEqual("abc", "abd")).toBe(false);
        expect(safeEqual("abc", "ab")).toBe(false);
    });

    it("sanitizeNextPath blocks open-redirects and weird inputs", () => {
        expect(sanitizeNextPath(null)).toBe("/");
        expect(sanitizeNextPath("")).toBe("/");
        expect(sanitizeNextPath("https://evil.com")).toBe("/");
        expect(sanitizeNextPath("//evil.com")).toBe("/");
        expect(sanitizeNextPath("///evil.com")).toBe("/");
        expect(sanitizeNextPath("account")).toBe("/");
        expect(sanitizeNextPath("/account")).toBe("/account");
        expect(sanitizeNextPath("/account?x=1")).toBe("/account?x=1");
        expect(sanitizeNextPath("/" + "a".repeat(600))).toBe("/");
    });
});

