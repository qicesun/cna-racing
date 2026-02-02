"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { SessionUser } from "@/lib/auth/types";

type SeriesKey = "gt3open" | "rookie" | "formula";

type SeriesDef = {
    key: SeriesKey;
    label: string;
    href: string;
    subnav: { label: string; href: string }[];
    comingSoon?: boolean;
};

export function TopNav() {
    const pathname = usePathname();

    const [wechatOpen, setWechatOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [authUser, setAuthUser] = useState<SessionUser | null>(null);

    // ✅ Discord 真链接
    const DISCORD_URL = "https://discord.gg/J3PwH5n2by";

    // ✅ 微信群二维码图片：放到 public/wechat.jpg
    const WECHAT_QR_SRC = "/wechat.jpg";

    const seriesList: SeriesDef[] = useMemo(
        () => [
            {
                key: "gt3open",
                label: "GT3 Open",
                href: "/gt3open",
                subnav: [
                    { label: "Overview", href: "/gt3open" },
                    { label: "Schedule 赛程", href: "/gt3open/schedule" },
                    { label: "Standings 积分", href: "/gt3open/standings" },
                    { label: "Results 结果", href: "/gt3open/results" },
                    { label: "Rules 规则", href: "/gt3open/rules" },
                ],
            },
            {
                key: "rookie",
                label: "CNA 新手赛",
                href: "/rookie",
                subnav: [
                    { label: "Overview", href: "/rookie" },
                    { label: "Schedule 赛程", href: "/rookie/schedule" },
                    { label: "Standings 积分", href: "/rookie/standings" },
                    { label: "Results 结果", href: "/rookie/results" },
                    { label: "Rules 规则", href: "/rookie/rules" },
                ],
            },
            // ✅ 预留：方程式系列（你之后建 /formula 页面即可）
            {
                key: "formula",
                label: "Formula",
                href: "/formula",
                comingSoon: true,
                subnav: [
                    { label: "Overview", href: "/formula" },
                    { label: "Schedule", href: "/formula/schedule" },
                    { label: "Standings", href: "/formula/standings" },
                    { label: "Results", href: "/formula/results" },
                    { label: "Rules", href: "/formula/rules" },
                ],
            },
        ],
        []
    );

    const activeSeries: SeriesDef | null = useMemo(() => {
        const hit = seriesList.find((s) => pathname?.startsWith(s.href));
        return hit ?? null;
    }, [pathname, seriesList]);

    function isActive(href: string) {
        if (href === "/") return pathname === "/";
        return pathname?.startsWith(href);
    }

    // ESC 关闭弹窗/菜单
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setWechatOpen(false);
                setMobileOpen(false);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // 路由变化时收起移动菜单
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    // Fetch current login status from the server (cookie-based session).
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch("/api/me", { cache: "no-store" });
                const data = res.ok ? ((await res.json()) as { user: SessionUser | null }) : null;
                if (cancelled) return;
                setAuthUser(data?.user ?? null);
            } catch {
                if (cancelled) return;
                setAuthUser(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <>
            <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
                <div className="mx-auto max-w-7xl px-6">
                    <div className="flex h-16 items-center justify-between gap-4">
                        {/* Left: Logo */}
                        <Link href="/" className="flex items-center gap-3">
                            <img src="/logo.png" alt="CNA Racing" className="h-9 w-auto" />
                            <div className="hidden sm:flex flex-col leading-tight">
                                <div className="text-sm font-semibold tracking-wide text-zinc-100">
                                    CNA RACING
                                </div>
                                <div className="text-[11px] tracking-widest text-zinc-400">
                                    SIM RACING LEAGUE
                                </div>
                            </div>
                        </Link>

                        {/* Desktop nav: show series directly */}
                        <nav className="hidden md:flex items-center gap-1">
                            <Link
                                href="/"
                                className={[
                                    "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                    isActive("/")
                                        ? "text-white bg-white/10"
                                        : "text-zinc-300 hover:text-white hover:bg-white/5",
                                ].join(" ")}
                            >
                                Home
                            </Link>
                            <Link
                                href="/drivers"
                                className={[
                                    "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                    isActive("/drivers")
                                        ? "text-white bg-white/10"
                                        : "text-zinc-300 hover:text-white hover:bg-white/5",
                                ].join(" ")}
                            >
                                Drivers
                            </Link>
                            <Link
                                href="/account"
                                className={[
                                    "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                    isActive("/account")
                                        ? "text-white bg-white/10"
                                        : "text-zinc-300 hover:text-white hover:bg-white/5",
                                ].join(" ")}
                            >
                                Account
                            </Link>
                            <Link
                                href="/signup"
                                className={[
                                    "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                    isActive("/signup")
                                        ? "text-white bg-white/10"
                                        : "text-zinc-300 hover:text-white hover:bg-white/5",
                                ].join(" ")}
                            >
                                报名
                            </Link>

                            {seriesList.map((s) => {
                                const active = isActive(s.href);

                                // coming soon：可以先不让点（避免 404）
                                if (s.comingSoon) {
                                    return (
                                        <span
                                            key={s.key}
                                            className={[
                                                "rounded-xl px-3 py-2 text-sm font-semibold",
                                                "text-zinc-500 border border-white/10 bg-white/5",
                                                active ? "ring-1 ring-white/10" : "",
                                            ].join(" ")}
                                            title="Coming soon"
                                        >
                      {s.label}
                                            <span className="ml-2 text-[10px] tracking-widest opacity-70">
                        SOON
                      </span>
                    </span>
                                    );
                                }

                                return (
                                    <Link
                                        key={s.key}
                                        href={s.href}
                                        className={[
                                            "rounded-xl px-3 py-2 text-sm font-semibold transition",
                                            active
                                                ? "text-white bg-white/10"
                                                : "text-zinc-300 hover:text-white hover:bg-white/5",
                                        ].join(" ")}
                                    >
                                        {s.label}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Right actions */}
                        <div className="flex items-center gap-2">
                            {authUser ? (
                                <>
                                    <Link
                                        href="/account"
                                        className="hidden sm:inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                                        title={`Logged in as ${authUser.iracingName}`}
                                    >
                                        {authUser.iracingName}
                                    </Link>
                                </>
                            ) : (
                                <Link
                                    href={`/oauth/login?next=${encodeURIComponent(pathname ?? "/")}`}
                                    className="hidden sm:inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                                >
                                    iRacing 登录
                                </Link>
                            )}

                            <a
                                href={DISCORD_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="hidden sm:inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                            >
                                Discord
                            </a>

                            <button
                                onClick={() => setWechatOpen(true)}
                                className="hidden sm:inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                            >
                                微信群
                            </button>

                            {/* Mobile hamburger */}
                            <button
                                className="md:hidden rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                                onClick={() => setMobileOpen((v) => !v)}
                                aria-expanded={mobileOpen}
                                aria-label="Open menu"
                            >
                                ☰
                            </button>
                        </div>
                    </div>

                    {/* Series subnav (desktop) */}
                    {activeSeries && (
                        <div className="hidden md:flex items-center gap-2 pb-3">
                            <div className="text-[11px] tracking-widest text-zinc-400">
                                {activeSeries.label}
                            </div>
                            <div className="h-3 w-px bg-white/10" />
                            {activeSeries.subnav.map((it) => (
                                <Link
                                    key={it.href}
                                    href={it.href}
                                    className={[
                                        "rounded-xl px-3 py-1.5 text-[13px] font-semibold transition",
                                        pathname === it.href
                                            ? "text-white bg-white/10"
                                            : "text-zinc-300 hover:text-white hover:bg-white/5",
                                    ].join(" ")}
                                >
                                    {it.label}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Mobile panel */}
                    {mobileOpen && (
                        <div className="md:hidden pb-4">
                            <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                                <div className="p-2">
                                    <Link
                                        href="/"
                                        className={[
                                            "block rounded-xl px-3 py-2 text-sm font-semibold transition",
                                            isActive("/")
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-300 hover:bg-white/5 hover:text-white",
                                        ].join(" ")}
                                    >
                                        Home
                                    </Link>
                                    <Link
                                        href="/drivers"
                                        className={[
                                            "mt-1 block rounded-xl px-3 py-2 text-sm font-semibold transition",
                                            isActive("/drivers")
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-300 hover:bg-white/5 hover:text-white",
                                        ].join(" ")}
                                    >
                                        Drivers
                                    </Link>
                                    <Link
                                        href="/account"
                                        className={[
                                            "mt-1 block rounded-xl px-3 py-2 text-sm font-semibold transition",
                                            isActive("/account")
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-300 hover:bg-white/5 hover:text-white",
                                        ].join(" ")}
                                    >
                                        Account
                                    </Link>
                                    <Link
                                        href="/signup"
                                        className={[
                                            "mt-1 block rounded-xl px-3 py-2 text-sm font-semibold transition",
                                            isActive("/signup")
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-300 hover:bg-white/5 hover:text-white",
                                        ].join(" ")}
                                    >
                                        报名
                                    </Link>

                                    <div className="mt-2 text-[11px] tracking-widest text-zinc-400 px-3">
                                        SERIES
                                    </div>

                                    {seriesList.map((s) => {
                                        if (s.comingSoon) {
                                            return (
                                                <div
                                                    key={s.key}
                                                    className="mt-1 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-500 border border-white/10 bg-white/5"
                                                >
                                                    {s.label} <span className="ml-2 text-[10px]">SOON</span>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={s.key} className="mt-1">
                                                <Link
                                                    href={s.href}
                                                    className={[
                                                        "block rounded-xl px-3 py-2 text-sm font-semibold transition",
                                                        isActive(s.href)
                                                            ? "bg-white/10 text-white"
                                                            : "text-zinc-300 hover:bg-white/5 hover:text-white",
                                                    ].join(" ")}
                                                >
                                                    {s.label}
                                                </Link>

                                                {/* show subnav for active series */}
                                                {isActive(s.href) && (
                                                    <div className="mt-1 ml-3 border-l border-white/10 pl-3">
                                                        {s.subnav.map((it) => (
                                                            <Link
                                                                key={it.href}
                                                                href={it.href}
                                                                className={[
                                                                    "block rounded-xl px-3 py-2 text-sm font-semibold transition",
                                                                    pathname === it.href
                                                                        ? "bg-white/10 text-white"
                                                                        : "text-zinc-300 hover:bg-white/5 hover:text-white",
                                                                ].join(" ")}
                                                            >
                                                                {it.label}
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    <div className="mt-3 flex gap-2 px-2 pb-2">
                                        <a
                                            href={DISCORD_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10 text-center"
                                        >
                                            Discord
                                        </a>
                                        <button
                                            onClick={() => setWechatOpen(true)}
                                            className="flex-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
                                        >
                                            微信群
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* WeChat modal */}
            {wechatOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6"
                    onClick={() => setWechatOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-zinc-100">加入微信群</div>
                            <button
                                onClick={() => setWechatOpen(false)}
                                className="rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-white"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mt-3 text-xs text-zinc-400 leading-relaxed">
                            扫码加入（如无法加入，先加群主微信再拉群）
                            <br />
                            群主微信: <span className="font-semibold text-zinc-200">pentadddghb</span>（备注：加入CNA）
                        </div>

                        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white">
                            <img src={WECHAT_QR_SRC} alt="WeChat Group QR" className="h-auto w-full" />
                        </div>

                        <div className="mt-3 text-xs text-zinc-500">点击空白处或按 ESC 关闭</div>
                    </div>
                </div>
            )}
        </>
    );
}
