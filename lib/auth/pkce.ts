import "server-only";

import { createHash, randomBytes } from "crypto";
import { base64UrlEncode } from "./utils";

export type PkcePair = {
    verifier: string;
    challenge: string;
    method: "S256";
};

export function createPkcePair(): PkcePair {
    // RFC 7636: code_verifier should be 43-128 chars. 32 random bytes -> 43 base64url chars.
    const verifier = base64UrlEncode(randomBytes(32));
    const challenge = base64UrlEncode(
        createHash("sha256").update(verifier, "utf8").digest()
    );

    return { verifier, challenge, method: "S256" };
}

export function createState(): string {
    // CSRF token for the OAuth redirect round-trip.
    return base64UrlEncode(randomBytes(16));
}

