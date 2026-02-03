import "server-only";

import { fetchIracingDataApi } from "@/lib/iracing/dataApi";

export async function fetchIracingSubsessionResult(params: {
    accessToken: string;
    subsessionId: number;
}): Promise<unknown> {
    return fetchIracingDataApi<unknown>({
        accessToken: params.accessToken,
        path: "/results/get",
        query: { subsession_id: params.subsessionId },
    });
}

