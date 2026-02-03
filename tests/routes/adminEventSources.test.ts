import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin", () => ({
    requireAdminUser: vi.fn(),
}));

vi.mock("@/lib/events/catalog", () => ({
    getEventById: vi.fn(),
    normalizeEventId: (v: string) => v,
}));

vi.mock("@/lib/db/cnaEventSources", () => ({
    getCnaEventSourceByEventId: vi.fn(),
    listCnaEventSources: vi.fn(),
    upsertCnaEventSource: vi.fn(),
}));

import { GET, POST } from "@/app/api/admin/event-sources/route";
import { requireAdminUser } from "@/lib/auth/admin";
import { getEventById } from "@/lib/events/catalog";
import { getCnaEventSourceByEventId, listCnaEventSources, upsertCnaEventSource } from "@/lib/db/cnaEventSources";

describe("app/api/admin/event-sources route", () => {
    it("GET returns 401 when not authenticated", async () => {
        vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error("Not authenticated."));
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("GET lists sources for admins", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(listCnaEventSources).mockResolvedValueOnce([
            {
                eventId: "gt3open:26S1:8",
                seriesKey: "gt3open",
                subsessionId: 83007142,
                createdBy: 1127717,
                createdAt: "x",
                updatedAt: "y",
            },
        ]);

        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.sources.length).toBe(1);
    });

    it("POST validates payload", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        const res = await POST({ json: async () => ({}) } as any);
        expect(res.status).toBe(400);
    });

    it("POST returns 404 when event not found", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce(null);
        const res = await POST({ json: async () => ({ eventId: "gt3open:26S1:8", subsessionId: 1 }) } as any);
        expect(res.status).toBe(404);
    });

    it("POST upserts mapping for admins", async () => {
        vi.mocked(requireAdminUser).mockResolvedValueOnce({ iracingCustId: 1127717, iracingName: "Admin" });
        vi.mocked(getEventById).mockReturnValueOnce({ seriesKey: "gt3open" } as any);
        vi.mocked(getCnaEventSourceByEventId).mockResolvedValueOnce(null);
        vi.mocked(upsertCnaEventSource).mockResolvedValueOnce(undefined);

        const res = await POST({
            json: async () => ({ eventId: "gt3open:26S1:8", subsessionId: 83007142 }),
        } as any);

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ ok: true });
        expect(upsertCnaEventSource).toHaveBeenCalledWith({
            eventId: "gt3open:26S1:8",
            seriesKey: "gt3open",
            subsessionId: 83007142,
            createdBy: 1127717,
        });
    });
});

