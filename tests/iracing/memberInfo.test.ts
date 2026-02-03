import { describe, expect, it } from "vitest";

import { normalizeIracingMemberInfo, selectSportsCarLicense } from "@/lib/iracing/memberInfo";

describe("lib/iracing/memberInfo", () => {
    it("normalizes member info and license entries", () => {
        const raw = {
            cust_id: 15535,
            display_name: "John West",
            licenses: [
                { category: "oval", category_id: 1, irating: 1200, safety_rating: 2.5, license_class: "C" },
                { category: "sports_car", category_id: 5, irating: 2601, safety_rating: 4.99, license_class: "A" },
            ],
        };

        const info = normalizeIracingMemberInfo(raw);
        expect(info?.custId).toBe(15535);
        expect(info?.displayName).toBe("John West");
        expect(info?.licenses.length).toBe(2);

        const sc = selectSportsCarLicense(info!.licenses);
        expect(sc?.category).toBe("sports_car");
        expect(sc?.irating).toBe(2601);
        expect(sc?.safetyRating).toBe(4.99);
        expect(sc?.licenseClass).toBe("A");
    });

    it("supports licenses as an object map keyed by category", () => {
        const raw = {
            cust_id: 15535,
            display_name: "John West",
            licenses: {
                oval: { category_id: 1, irating: 1200, safety_rating: 2.5, license_class: "C" },
                sports_car: { category_id: 5, irating: 2601, safety_rating: 4.99, license_class: "A" },
            },
        };

        const info = normalizeIracingMemberInfo(raw);
        expect(info?.licenses.length).toBe(2);
        const sc = selectSportsCarLicense(info!.licenses);
        expect(sc?.category).toBe("sports_car");
        expect(sc?.irating).toBe(2601);
        expect(sc?.safetyRating).toBe(4.99);
    });

    it("returns null for invalid payloads", () => {
        expect(normalizeIracingMemberInfo(null)).toBeNull();
        expect(normalizeIracingMemberInfo({})).toBeNull();
        expect(normalizeIracingMemberInfo({ cust_id: "nope" })).toBeNull();
    });
});
