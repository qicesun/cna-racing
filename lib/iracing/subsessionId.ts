export function extractSubsessionIdFromText(input: string): number | null {
    const raw = String(input ?? "").trim();
    if (!raw) return null;

    // Plain number.
    if (/^\d+$/.test(raw)) {
        const n = Number(raw);
        return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
    }

    const tryParseUrl = (value: string): URL | null => {
        try {
            return new URL(value);
        } catch {
            return null;
        }
    };

    const readFromUrl = (u: URL): number | null => {
        const keys = ["subsessionid", "subsession_id", "subsession"];
        for (const k of keys) {
            const v = u.searchParams.get(k);
            if (!v) continue;
            if (!/^\d+$/.test(v)) continue;
            const n = Number(v);
            if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
        }
        return null;
    };

    const directUrl = tryParseUrl(raw);
    if (directUrl) {
        const n = readFromUrl(directUrl);
        if (n) return n;
    }

    // If user pasted a host/path without protocol, try https://
    if (!raw.startsWith("http://") && !raw.startsWith("https://") && raw.includes(".")) {
        const prefixed = tryParseUrl(`https://${raw}`);
        if (prefixed) {
            const n = readFromUrl(prefixed);
            if (n) return n;
        }
    }

    // Regex fallback (works for both URLs and pasted snippets).
    const m =
        raw.match(/(?:subsessionid|subsession_id|subsession)\s*=?\s*(\d{5,})/i) ??
        raw.match(/\b(\d{5,})\b/);
    if (!m?.[1]) return null;

    const n = Number(m[1]);
    return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

