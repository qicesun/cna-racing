import "server-only";

const DEFAULT_BASE_URL = "https://members-ng.iracing.com/data";

function getBaseUrl(): string {
    const baseUrl = process.env.IRACING_DATA_API_BASE_URL ?? DEFAULT_BASE_URL;
    if (!/^https:\/\/.+/i.test(baseUrl)) {
        throw new Error("Invalid IRACING_DATA_API_BASE_URL (expected an https URL).");
    }
    return baseUrl.replace(/\/+$/, "");
}

function toStringValue(value: string | number | boolean): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    return value ? "true" : "false";
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function getLinkFromResponse(json: unknown): string | null {
    if (!isObject(json)) return null;
    const link = json.link;
    return typeof link === "string" && link.length > 0 ? link : null;
}

export async function fetchIracingDataApi<T>(params: {
    accessToken: string;
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
}): Promise<T> {
    const baseUrl = getBaseUrl();
    const path = params.path.startsWith("/") ? params.path : `/${params.path}`;
    const url = new URL(`${baseUrl}${path}`);

    for (const [k, v] of Object.entries(params.query ?? {})) {
        if (v === undefined) continue;
        url.searchParams.set(k, toStringValue(v));
    }

    const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${params.accessToken}` },
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`iRacing Data API ${url.pathname} failed with HTTP ${res.status}`);
    }

    const first = (await res.json()) as unknown;
    const link = getLinkFromResponse(first);
    if (!link) return first as T;

    const linkUrl = new URL(link, baseUrl);
    const includeAuth = linkUrl.origin === new URL(baseUrl).origin;

    const linkedRes = await fetch(linkUrl.toString(), {
        method: "GET",
        headers: includeAuth ? { Authorization: `Bearer ${params.accessToken}` } : undefined,
        cache: "no-store",
    });

    if (!linkedRes.ok) {
        throw new Error(`iRacing Data API link fetch failed with HTTP ${linkedRes.status}`);
    }

    return (await linkedRes.json()) as T;
}

