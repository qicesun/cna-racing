import { describe, expect, it, vi } from "vitest";

const fetchIracingDataApi = vi.fn();

vi.mock("@/lib/iracing/dataApi", () => ({
    fetchIracingDataApi: (args: any) => fetchIracingDataApi(args),
}));

import { fetchIracingSubsessionResult } from "@/lib/iracing/results";

describe("lib/iracing/results", () => {
    it("calls Data API /results/get with subsession_id", async () => {
        fetchIracingDataApi.mockResolvedValueOnce({ ok: true });

        await expect(fetchIracingSubsessionResult({ accessToken: "t", subsessionId: 123 })).resolves.toEqual({ ok: true });

        expect(fetchIracingDataApi).toHaveBeenCalledWith({
            accessToken: "t",
            path: "/results/get",
            query: { subsession_id: 123 },
        });
    });
});

