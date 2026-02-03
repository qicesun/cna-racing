import { describe, expect, it } from "vitest";

import { extractSubsessionIdFromText } from "@/lib/iracing/subsessionId";

describe("lib/iracing/subsessionId", () => {
    it("parses plain numeric strings", () => {
        expect(extractSubsessionIdFromText("83007142")).toBe(83007142);
        expect(extractSubsessionIdFromText("  83007142 ")).toBe(83007142);
    });

    it("parses subsessionid from iRacing member links", () => {
        expect(
            extractSubsessionIdFromText(
                "https://members.iracing.com/membersite/member/EventResult.do?subsessionid=83007142"
            )
        ).toBe(83007142);
    });

    it("parses subsession_id from Data API-style links", () => {
        expect(
            extractSubsessionIdFromText(
                "https://data.iracing.com/data/results/get?subsession_id=83007142"
            )
        ).toBe(83007142);
    });

    it("parses ids from protocol-less URLs", () => {
        expect(
            extractSubsessionIdFromText(
                "members.iracing.com/membersite/member/EventResult.do?subsessionid=83007142"
            )
        ).toBe(83007142);
    });

    it("returns null for empty/invalid inputs", () => {
        expect(extractSubsessionIdFromText("")).toBeNull();
        expect(extractSubsessionIdFromText("not a url")).toBeNull();
        expect(extractSubsessionIdFromText("subsessionid=nope")).toBeNull();
        expect(extractSubsessionIdFromText("-1")).toBeNull();
    });
});

