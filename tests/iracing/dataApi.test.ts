import { describe, expect, it, vi } from "vitest";

import { fetchIracingDataApi } from "@/lib/iracing/dataApi";

describe("lib/iracing/dataApi", () => {
    it("follows a link response", async () => {
        process.env.IRACING_DATA_API_BASE_URL = "https://members-ng.iracing.com/data";

        const fetchMock = vi.fn(async (url: any, init?: RequestInit) => {
            const u = String(url);
            if (u === "https://members-ng.iracing.com/data/member/info") {
                expect(init?.headers).toEqual({ Authorization: "Bearer ACCESS" });
                return new Response(JSON.stringify({ link: "https://example.test/payload.json" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (u === "https://example.test/payload.json") {
                expect(init?.headers).toBeUndefined();
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            throw new Error(`unexpected url: ${u}`);
        });

        vi.stubGlobal("fetch", fetchMock);
        try {
            await expect(fetchIracingDataApi<any>({ accessToken: "ACCESS", path: "/member/info" })).resolves.toEqual({
                ok: true,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("returns inline JSON when no link is present", async () => {
        process.env.IRACING_DATA_API_BASE_URL = "https://members-ng.iracing.com/data";

        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ hello: "world" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        try {
            const data = await fetchIracingDataApi<any>({ accessToken: "ACCESS", path: "/member/inline" });
            expect(data).toEqual({ hello: "world" });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

