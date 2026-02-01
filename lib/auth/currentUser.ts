import "server-only";

import { cookies } from "next/headers";
import { readSessionCookieValue, SESSION_COOKIE_NAME, SessionUser } from "./session";

export async function getCurrentUser(): Promise<SessionUser | null> {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = readSessionCookieValue(cookieValue);
    return session?.user ?? null;
}
