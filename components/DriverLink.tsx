"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

type DriverSummary = {
    custId: number;
    displayName: string;
    iracingName: string | null;
    lastLoginAt: string | null;
    profile: {
        nickname: string | null;
        discord: string | null;
        preferredCar: string | null;
        carNumber: string | null;
    } | null;
    cna: {
        points: number;
        starts: number;
        wins: number;
        podiums: number;
        series: Array<{
            seriesKey: string;
            seasonKey: string;
            points: number;
            starts: number;
            wins: number;
            podiums: number;
            updatedAt: string | null;
        }>;
    } | null;
    iracing: {
        irating: number | null;
        safetyRating: number | null;
        fetchedAt: string | null;
        expiresAt: string | null;
        stale: boolean;
    } | null;
};

const summaryCache = new Map<number, DriverSummary>();
const inflight = new Map<number, Promise<DriverSummary | null>>();

async function fetchDriverSummary(custId: number): Promise<DriverSummary | null> {
    const cached = summaryCache.get(custId);
    if (cached) return cached;

    const existing = inflight.get(custId);
    if (existing) return existing;

    const p = (async () => {
        try {
            const res = await fetch(`/api/drivers/${custId}/summary`, { cache: "no-store" });
            if (!res.ok) return null;
            const json = (await res.json()) as DriverSummary;
            if (!json || typeof json.custId !== "number") return null;
            summaryCache.set(custId, json);
            return json;
        } catch {
            return null;
        } finally {
            inflight.delete(custId);
        }
    })();

    inflight.set(custId, p);
    return p;
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

type Props = {
    custId?: number | null;
    name: string;
    className?: string;
    hoverCard?: boolean;
};

export default function DriverLink({ custId, name, className, hoverCard = true }: Props) {
    const safeCustId = typeof custId === "number" && Number.isFinite(custId) && custId > 0 ? Math.trunc(custId) : null;

    const wrapRef = useRef<HTMLSpanElement | null>(null);
    const openTimer = useRef<number | null>(null);
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const [summary, setSummary] = useState<DriverSummary | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        return () => {
            if (openTimer.current) window.clearTimeout(openTimer.current);
        };
    }, []);

    const href = safeCustId ? `/drivers/${safeCustId}` : null;

    const updatePosition = () => {
        const el = wrapRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();

        const cardWidth = 320;
        const margin = 12;
        const left = clamp(r.left, margin, window.innerWidth - cardWidth - margin);
        const top = r.bottom + 10;
        setPos({ top, left });
    };

    useEffect(() => {
        if (!open) return;

        updatePosition();
        const onScroll = () => updatePosition();
        const onResize = () => updatePosition();
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const title = useMemo(() => {
        if (!safeCustId) return name;
        return `查看车手主页 /drivers/${safeCustId}`;
    }, [name, safeCustId]);

    const onEnter = () => {
        if (!hoverCard || !safeCustId) return;
        if (openTimer.current) window.clearTimeout(openTimer.current);
        openTimer.current = window.setTimeout(async () => {
            setOpen(true);
            updatePosition();
            if (summaryCache.has(safeCustId)) {
                setSummary(summaryCache.get(safeCustId) ?? null);
                return;
            }
            setLoading(true);
            const s = await fetchDriverSummary(safeCustId);
            setSummary(s);
            setLoading(false);
        }, 260);
    };

    const onLeave = () => {
        if (openTimer.current) window.clearTimeout(openTimer.current);
        openTimer.current = null;
        setOpen(false);
    };

    const link = href ? (
        <Link href={href} className={className ?? "hover:underline"} title={title}>
            {name}
        </Link>
    ) : (
        <span className={className}>{name}</span>
    );

    return (
        <span ref={wrapRef} onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={onLeave}>
            {link}
            {mounted && open && safeCustId
                ? createPortal(
                    <div
                        className="fixed z-[200] w-[320px] rounded-2xl border border-white/10 bg-zinc-950/95 text-zinc-100 shadow-[0_30px_80px_rgba(0,0,0,0.65)] backdrop-blur"
                        style={{ top: pos.top, left: pos.left }}
                        role="dialog"
                        aria-label="Driver info"
                    >
                        <div className="px-4 py-3 border-b border-white/10">
                            <div className="text-sm font-semibold text-white">
                                {summary?.displayName ?? name}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-400 font-mono">
                                custId: {safeCustId}
                            </div>
                        </div>

                        <div className="px-4 py-3 grid gap-2 text-xs text-zinc-200">
                            {loading && <div className="text-zinc-400">Loading…</div>}

                            {!loading && summary?.iracing ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-zinc-300">iRacing (Sports Car)</div>
                                    <div className="font-mono">
                                        iR {summary.iracing.irating ?? "—"} · SR {summary.iracing.safetyRating ?? "—"}
                                        {summary.iracing.stale ? " (stale)" : ""}
                                    </div>
                                </div>
                            ) : null}

                            {!loading && summary?.cna ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-zinc-300">CNA</div>
                                    <div className="font-mono">
                                        Pts {summary.cna.points} · Starts {summary.cna.starts}
                                    </div>
                                </div>
                            ) : null}

                            {!loading && summary?.profile?.discord ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-zinc-300">Discord</div>
                                    <div className="font-mono truncate max-w-[170px] text-right">
                                        {summary.profile.discord}
                                    </div>
                                </div>
                            ) : null}

                            {!loading && summary?.profile?.carNumber ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-zinc-300">Car #</div>
                                    <div className="font-mono">{summary.profile.carNumber}</div>
                                </div>
                            ) : null}

                            {!loading && summary?.profile?.preferredCar ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-zinc-300">Car</div>
                                    <div className="truncate max-w-[170px] text-right">
                                        {summary.profile.preferredCar}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="px-4 py-3 border-t border-white/10 flex justify-end">
                            <Link
                                href={`/drivers/${safeCustId as number}`}
                                className="inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                            >
                                查看主页 →
                            </Link>
                        </div>
                    </div>,
                    document.body
                )
                : null}
        </span>
    );
}
