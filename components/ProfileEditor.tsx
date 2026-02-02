"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { EditableUserProfile, ProfileLink } from "@/lib/user/profile";
import { PROFILE_LIMITS } from "@/lib/user/profile";

type Props = {
    initialProfile: EditableUserProfile;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function clampLinks(links: ProfileLink[]): ProfileLink[] {
    return links.slice(0, PROFILE_LIMITS.linksMax);
}

export default function ProfileEditor({ initialProfile }: Props) {
    const router = useRouter();
    const [state, setState] = useState<SaveState>("idle");
    const [error, setError] = useState<string | null>(null);

    const [nickname, setNickname] = useState(initialProfile.nickname ?? "");
    const [discord, setDiscord] = useState(initialProfile.discord ?? "");
    const [bio, setBio] = useState(initialProfile.bio ?? "");
    const [preferredCar, setPreferredCar] = useState(initialProfile.preferredCar ?? "");
    const [carNumber, setCarNumber] = useState(initialProfile.carNumber ?? "");
    const [links, setLinks] = useState<ProfileLink[]>(clampLinks(initialProfile.links ?? []));

    const remainingLinks = useMemo(
        () => PROFILE_LIMITS.linksMax - links.length,
        [links.length]
    );

    async function save() {
        setState("saving");
        setError(null);

        try {
            const res = await fetch("/api/me/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nickname,
                    discord,
                    bio,
                    preferredCar,
                    carNumber,
                    links,
                }),
            });

            if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try {
                    const json = await res.json();
                    msg = json?.error_description || json?.error || msg;
                } catch {
                    // ignore
                }
                throw new Error(msg);
            }

            setState("saved");
            router.refresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "保存失败";
            setError(msg);
            setState("error");
        }
    }

    function updateLink(index: number, patch: Partial<ProfileLink>) {
        setLinks((prev) =>
            prev.map((l, i) => (i === index ? { ...l, ...patch } : l))
        );
    }

    function removeLink(index: number) {
        setLinks((prev) => prev.filter((_, i) => i !== index));
    }

    function addLink() {
        if (links.length >= PROFILE_LIMITS.linksMax) return;
        setLinks((prev) => [...prev, { label: "", url: "" }]);
    }

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs tracking-widest text-zinc-400">PROFILE</div>
                    <div className="mt-1 text-lg font-semibold text-white">我的公开资料</div>
                    <div className="mt-1 text-sm text-zinc-400">
                        这些信息会展示在你的公开主页中。
                    </div>
                </div>

                <button
                    type="button"
                    onClick={save}
                    disabled={state === "saving"}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                >
                    {state === "saving" ? "保存中..." : "保存"}
                </button>
            </div>

            {error && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            {state === "saved" && !error && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    已保存
                </div>
            )}

            <div className="mt-6 grid gap-4">
                <label className="grid gap-1">
                    <span className="text-sm text-zinc-300">昵称（可选）</span>
                    <input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={PROFILE_LIMITS.nicknameMax}
                        className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                        placeholder="用于展示的昵称"
                    />
                </label>

                <label className="grid gap-1">
                    <span className="text-sm text-zinc-300">Discord（可选）</span>
                    <input
                        value={discord}
                        onChange={(e) => setDiscord(e.target.value)}
                        maxLength={PROFILE_LIMITS.discordMax}
                        className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                        placeholder="例如: name#1234"
                    />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1">
                        <span className="text-sm text-zinc-300">常用车（可选）</span>
                        <input
                            value={preferredCar}
                            onChange={(e) => setPreferredCar(e.target.value)}
                            maxLength={PROFILE_LIMITS.preferredCarMax}
                            className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                            placeholder="例如: Porsche 911 GT3 R"
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-sm text-zinc-300">号码（可选）</span>
                        <input
                            value={carNumber}
                            onChange={(e) => setCarNumber(e.target.value)}
                            maxLength={PROFILE_LIMITS.carNumberMax}
                            className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                            placeholder="例如: 88"
                        />
                    </label>
                </div>

                <label className="grid gap-1">
                    <span className="text-sm text-zinc-300">简介（可选）</span>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={PROFILE_LIMITS.bioMax}
                        className="min-h-[100px] resize-y rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                        placeholder="写点什么..."
                    />
                    <span className="text-xs text-zinc-500">
                        {bio.length}/{PROFILE_LIMITS.bioMax}
                    </span>
                </label>

                <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-zinc-300">外链（最多 {PROFILE_LIMITS.linksMax} 条）</span>
                        <button
                            type="button"
                            onClick={addLink}
                            disabled={remainingLinks <= 0}
                            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                        >
                            添加外链
                        </button>
                    </div>

                    <div className="grid gap-3">
                        {links.map((l, idx) => (
                            <div key={idx} className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
                                <div className="grid gap-2 md:grid-cols-2">
                                    <label className="grid gap-1">
                                        <span className="text-xs text-zinc-400">标题</span>
                                        <input
                                            value={l.label}
                                            onChange={(e) => updateLink(idx, { label: e.target.value })}
                                            maxLength={PROFILE_LIMITS.linkLabelMax}
                                            className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                                            placeholder="例如: Stream"
                                        />
                                    </label>
                                    <label className="grid gap-1">
                                        <span className="text-xs text-zinc-400">URL</span>
                                        <input
                                            value={l.url}
                                            onChange={(e) => updateLink(idx, { url: e.target.value })}
                                            maxLength={PROFILE_LIMITS.linkUrlMax}
                                            className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
                                            placeholder="https://..."
                                        />
                                    </label>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => removeLink(idx)}
                                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                        ))}

                        {links.length === 0 && (
                            <div className="text-sm text-zinc-500">暂无外链。</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

