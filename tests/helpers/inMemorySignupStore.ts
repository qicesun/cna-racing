import type { Signup, SignupUser } from "@/lib/signup/types";

type SignupRow = { createdAt: string };

export class InMemorySignupStore {
    private readonly users = new Map<number, string>();
    private readonly signups = new Map<string, Map<number, SignupRow>>();

    async upsertUser(user: SignupUser): Promise<void> {
        this.users.set(user.iracingCustId, user.iracingName);
    }

    async createSignup(eventId: string, user: SignupUser): Promise<{ created: boolean }> {
        await this.upsertUser(user);
        const map = this.signups.get(eventId) ?? new Map<number, SignupRow>();
        if (map.has(user.iracingCustId)) return { created: false };
        map.set(user.iracingCustId, { createdAt: new Date(Date.now()).toISOString() });
        this.signups.set(eventId, map);
        return { created: true };
    }

    async deleteSignup(eventId: string, iracingCustId: number): Promise<{ deleted: boolean }> {
        const map = this.signups.get(eventId);
        if (!map) return { deleted: false };
        const deleted = map.delete(iracingCustId);
        if (map.size === 0) this.signups.delete(eventId);
        return { deleted };
    }

    async listSignupsForEvent(eventId: string): Promise<Signup[]> {
        const map = this.signups.get(eventId) ?? new Map<number, SignupRow>();
        const rows = Array.from(map.entries())
            .map(([custId, row]) => ({
                custId,
                createdAt: row.createdAt,
                name: this.users.get(custId) ?? `#${custId}`,
            }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.custId - b.custId);

        return rows.map((r) => ({
            eventId,
            createdAt: r.createdAt,
            user: { iracingCustId: r.custId, iracingName: r.name },
        }));
    }

    async listSignupRowsForEvents(eventIds: string[]): Promise<Array<{ eventId: string; iracingCustId: number }>> {
        const out: Array<{ eventId: string; iracingCustId: number }> = [];
        for (const id of eventIds) {
            const map = this.signups.get(id);
            if (!map) continue;
            for (const custId of map.keys()) {
                out.push({ eventId: id, iracingCustId: custId });
            }
        }
        return out;
    }

    async listSignupsForUser(iracingCustId: number): Promise<Array<{ eventId: string; createdAt: string }>> {
        const out: Array<{ eventId: string; createdAt: string }> = [];
        for (const [eventId, map] of this.signups.entries()) {
            const row = map.get(iracingCustId);
            if (!row) continue;
            out.push({ eventId, createdAt: row.createdAt });
        }
        out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.eventId.localeCompare(b.eventId));
        return out;
    }
}

