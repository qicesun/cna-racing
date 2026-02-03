import "server-only";

import { fetchIracingDataApi } from "@/lib/iracing/dataApi";

export type IracingLicense = {
    category: string | null;
    categoryId: number | null;
    licenseClass: string | null;
    irating: number | null;
    safetyRating: number | null;
};

export type IracingMemberInfo = {
    custId: number;
    displayName: string | null;
    licenses: IracingLicense[];
};

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function readString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length ? value : null;
}

function normalizeLicense(raw: unknown): IracingLicense | null {
    if (!isObject(raw)) return null;

    const category = readString(raw.category ?? raw.category_name ?? raw.license_category) ?? null;
    const categoryId = readNumber(raw.category_id ?? raw.categoryId) ?? null;

    const licenseClass =
        readString(raw.license_class ?? raw.licenseClass ?? raw.class) ??
        (readNumber(raw.license_class_id ?? raw.licenseClassId) !== null
            ? String(readNumber(raw.license_class_id ?? raw.licenseClassId))
            : null);

    const irating = readNumber(raw.irating ?? raw.i_rating ?? raw.iRating) ?? null;
    const safetyRating = readNumber(raw.safety_rating ?? raw.safetyRating ?? raw.sr) ?? null;

    // At least one meaningful field must exist to keep the entry.
    if (!category && categoryId === null && irating === null && safetyRating === null && !licenseClass) return null;

    return { category, categoryId, licenseClass, irating, safetyRating };
}

export function normalizeIracingMemberInfo(raw: unknown): IracingMemberInfo | null {
    if (!isObject(raw)) return null;

    const custId = readNumber(raw.cust_id ?? raw.custId ?? raw.iracing_cust_id ?? raw.iracingCustId);
    if (!custId || !Number.isInteger(custId)) return null;

    const displayName =
        readString(raw.display_name ?? raw.displayName ?? raw.iracing_name ?? raw.iracingName) ?? null;

    let rawLicenses: unknown[] = [];
    if (Array.isArray(raw.licenses)) {
        rawLicenses = raw.licenses;
    } else if (isObject(raw.licenses)) {
        // Some payloads encode licenses as an object map keyed by category.
        rawLicenses = Object.entries(raw.licenses).map(([category, value]) => {
            if (!isObject(value)) return null;
            return { category, ...value };
        });
    }

    const licenses = rawLicenses
        .map(normalizeLicense)
        .filter((l): l is IracingLicense => l !== null);

    return { custId, displayName, licenses };
}

export function selectSportsCarLicense(licenses: IracingLicense[]): IracingLicense | null {
    if (!licenses.length) return null;
    return licenses.find((l) => l.category === "sports_car" || l.categoryId === 5) ?? null;
}

export async function fetchIracingMemberInfo(accessToken: string): Promise<IracingMemberInfo> {
    // /data/member/info returns information for the authenticated member.
    const raw = await fetchIracingDataApi<unknown>({ accessToken, path: "/member/info" });
    const info = normalizeIracingMemberInfo(raw);
    if (!info) {
        throw new Error("Unexpected iRacing member info response.");
    }
    return info;
}
