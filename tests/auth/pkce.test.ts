import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

import { createPkcePair, createState } from "@/lib/auth/pkce";
import { base64UrlEncode } from "@/lib/auth/utils";

describe("lib/auth/pkce", () => {
    it("createPkcePair returns a valid RFC7636 S256 pair", () => {
        const { verifier, challenge, method } = createPkcePair();

        expect(method).toBe("S256");
        expect(verifier.length).toBeGreaterThanOrEqual(43);
        expect(verifier.length).toBeLessThanOrEqual(128);
        expect(verifier).not.toMatch(/[+/=]/);
        expect(challenge).not.toMatch(/[+/=]/);

        const expected = base64UrlEncode(
            createHash("sha256").update(verifier, "utf8").digest()
        );
        expect(challenge).toBe(expected);
    });

    it("createState returns a URL-safe random token", () => {
        const s1 = createState();
        const s2 = createState();

        expect(s1).not.toBe(s2);
        expect(s1).not.toMatch(/[+/=]/);
        expect(s1.length).toBeGreaterThanOrEqual(20);
    });
});

