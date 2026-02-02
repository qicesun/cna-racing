"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SessionUser } from "@/lib/auth/types";

type StatusPayload = Record<string, { count: number; signedUp: boolean }>;

let cachedMe: Promise<SessionUser | null> | null = null;

async function fetchMe(): Promise<SessionUser | null> {
    if (!cachedMe) {
        cachedMe = (async () => {
            const res = await fetch("/api/me", { cache: "no-store" });
            if (!res.ok) return null;
            const json = (await res.json()) as { user: SessionUser | null };
            return json.user ?? null;
        })();
    }
    return cachedMe;
}

async function fetchStatus(eventIds: string[]): Promise<StatusPayload> {
    const idsParam = encodeURIComponent(eventIds.join(","));
    const res = await fetch(`/api/events/status?ids=${idsParam}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`status http ${res.status}`);
    const json = (await res.json()) as { events?: StatusPayload };
    return json.events ?? {};
}

export function EventSignupButton(props: { eventId: string; className?: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [count, setCount] = useState<number>(0);
    const [signedUp, setSignedUp] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const eventId = props.eventId;
    const eventHref = useMemo(() => `/events/${encodeURIComponent(eventId)}`, [eventId]);
    const loginHref = useMemo(() => `/oauth/login?next=${encodeURIComponent(pathname ?? "/")}`, [pathname]);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const status = await fetchStatus([eventId]);
            const s = status[eventId];
            setCount(s?.count ?? 0);
            setSignedUp(Boolean(s?.signedUp));
        } catch {
            setError("加载报名信息失败");
        }
    }, [eventId]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const me = await fetchMe();
                if (cancelled) return;
                setUser(me);
            } catch {
                if (cancelled) return;
                setUser(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const doSignup = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/signup`, {
                method: "POST",
                cache: "no-store",
            });
            if (res.status === 401) {
                setError("请先登录再报名");
                return;
            }
            if (!res.ok) throw new Error(`signup http ${res.status}`);
            await refresh();
            // The roster page is server-rendered; refresh the route so the list updates.
            router.refresh();
        } catch {
            setError("报名失败，请稍后重试");
        } finally {
            setLoading(false);
        }
    }, [eventId, refresh, router]);

    const doCancel = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/signup`, {
                method: "DELETE",
                cache: "no-store",
            });
            if (res.status === 401) {
                setError("请先登录再取消报名");
                return;
            }
            if (!res.ok) throw new Error(`cancel http ${res.status}`);
            await refresh();
            router.refresh();
        } catch {
            setError("取消报名失败，请稍后重试");
        } finally {
            setLoading(false);
        }
    }, [eventId, refresh, router]);

    return (
        <div className={["flex flex-wrap items-center gap-2", props.className ?? ""].join(" ")}>
            <span className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-100">
                已报名 {count}
            </span>

            <Link
                href={eventHref}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10"
            >
                查看名单
            </Link>

            {user ? (
                signedUp ? (
                    <button
                        type="button"
                        onClick={doCancel}
                        disabled={loading}
                        className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                    >
                        取消报名
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={doSignup}
                        disabled={loading}
                        className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                    >
                        报名
                    </button>
                )
            ) : (
                <Link
                    href={loginHref}
                    className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:opacity-90"
                >
                    登录后报名
                </Link>
            )}

            {error && <span className="text-xs text-red-300">{error}</span>}
        </div>
    );
}
