import { describe, expect, it } from "vitest";

import { parseEditableUserProfile } from "@/lib/user/profile";

describe("lib/user/profile", () => {
    it("parses and normalizes editable profile payload", () => {
        const profile = parseEditableUserProfile({
            nickname: "  Zile  ",
            discord: "zile#1234",
            bio: "hello",
            preferredCar: "  Porsche 911 GT3 R ",
            carNumber: "  88 ",
            links: [
                { label: "Stream", url: "https://example.com/stream" },
                { label: "Site", url: "https://example.com" },
            ],
        });

        expect(profile.nickname).toBe("Zile");
        expect(profile.preferredCar).toBe("Porsche 911 GT3 R");
        expect(profile.carNumber).toBe("88");
        expect(profile.links).toEqual([
            { label: "Stream", url: "https://example.com/stream" },
            { label: "Site", url: "https://example.com/" },
        ]);
    });

    it("treats empty strings as null and missing links as []", () => {
        const profile = parseEditableUserProfile({
            nickname: "   ",
            discord: "",
        });
        expect(profile.nickname).toBeNull();
        expect(profile.discord).toBeNull();
        expect(profile.links).toEqual([]);
    });

    it("rejects non-http links", () => {
        expect(() =>
            parseEditableUserProfile({
                links: [{ label: "x", url: "javascript:alert(1)" }],
            })
        ).toThrow(/http/);
    });

    it("rejects too many links", () => {
        expect(() =>
            parseEditableUserProfile({
                links: new Array(6).fill(0).map((_, i) => ({ label: `L${i}`, url: "https://example.com" })),
            })
        ).toThrow(/links is too long/i);
    });
});

