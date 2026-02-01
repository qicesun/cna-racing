import { describe, expect, it } from "vitest";

import { GET as logoutGet } from "@/app/logout/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

function getSetCookies(res: Response): string[] {
    const h = res.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof h.getSetCookie === "function") return h.getSetCookie();
    const single = res.headers.get("set-cookie");
    return single ? [single] : [];
}

describe("app/logout route", () => {
    it("clears session cookie and redirects to next path", async () => {
        const req = {
            nextUrl: new URL("https://cna-racing.vercel.app/logout?next=/account"),
        } as any;

        const res = await logoutGet(req);
        expect(res.status).toBe(307);

        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/account");

        const setCookies = getSetCookies(res).join("\n");
        expect(setCookies).toContain(`${SESSION_COOKIE_NAME}=`);
        expect(setCookies).toMatch(/Max-Age=0/i);
    });

    it("sanitizes next to prevent open redirects", async () => {
        const req = {
            nextUrl: new URL("https://cna-racing.vercel.app/logout?next=https://evil.com"),
        } as any;

        const res = await logoutGet(req);
        const loc = new URL(res.headers.get("location")!);
        expect(loc.pathname).toBe("/");
    });
});

