export type ProfileLink = {
    label: string;
    url: string;
};

export type EditableUserProfile = {
    nickname: string | null;
    discord: string | null;
    bio: string | null;
    preferredCar: string | null;
    carNumber: string | null;
    links: ProfileLink[];
};

export const PROFILE_LIMITS = {
    nicknameMax: 50,
    discordMax: 50,
    bioMax: 500,
    preferredCarMax: 80,
    carNumberMax: 20,
    linksMax: 5,
    linkLabelMax: 30,
    linkUrlMax: 2000,
} as const;

function toTrimmedString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const s = value.trim();
    return s.length ? s : null;
}

function parseLimitedString(value: unknown, maxLen: number, field: string): string | null {
    const s = toTrimmedString(value);
    if (s === null) return null;
    if (s.length > maxLen) {
        throw new Error(`${field} is too long (max ${maxLen}).`);
    }
    return s;
}

function parseLinks(value: unknown): ProfileLink[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error("links must be an array.");
    if (value.length > PROFILE_LIMITS.linksMax) {
        throw new Error(`links is too long (max ${PROFILE_LIMITS.linksMax}).`);
    }

    const out: ProfileLink[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object") throw new Error("links must contain objects.");
        const label = parseLimitedString((item as any).label, PROFILE_LIMITS.linkLabelMax, "links[].label");
        const url = parseLimitedString((item as any).url, PROFILE_LIMITS.linkUrlMax, "links[].url");
        if (!label || !url) throw new Error("links[].label and links[].url are required.");

        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error("links[].url must be a valid URL.");
        }
        const protocol = parsed.protocol.toLowerCase();
        if (protocol !== "http:" && protocol !== "https:") {
            throw new Error("links[].url must start with http:// or https://.");
        }

        out.push({ label, url: parsed.toString() });
    }

    return out;
}

export function parseEditableUserProfile(input: unknown): EditableUserProfile {
    if (!input || typeof input !== "object") {
        throw new Error("Invalid body (expected JSON object).");
    }

    const obj = input as any;

    return {
        nickname: parseLimitedString(obj.nickname, PROFILE_LIMITS.nicknameMax, "nickname"),
        discord: parseLimitedString(obj.discord, PROFILE_LIMITS.discordMax, "discord"),
        bio: parseLimitedString(obj.bio, PROFILE_LIMITS.bioMax, "bio"),
        preferredCar: parseLimitedString(obj.preferredCar, PROFILE_LIMITS.preferredCarMax, "preferredCar"),
        carNumber: parseLimitedString(obj.carNumber, PROFILE_LIMITS.carNumberMax, "carNumber"),
        links: parseLinks(obj.links),
    };
}

