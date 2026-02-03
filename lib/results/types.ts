export type CnaEventRaceResultRowV1 = {
    custId: number;
    name: string;
    finishPosition: number; // 1-based
    points: number;
    champPoints: number | null;
    carName: string | null;
    carNumber: string | null;
    incidents: number | null;
    lapsComplete: number | null;
    reasonOut: string | null;
};

export type CnaEventRaceResultsV1 = {
    version: 1;
    results: CnaEventRaceResultRowV1[];
};

export type CnaSeriesStandingsRowV1 = {
    custId: number;
    name: string;
    points: number;
    starts: number;
    wins: number;
    podiums: number;
};

export type CnaSeriesStandingsV1 = {
    version: 1;
    seriesKey: string;
    seasonKey: string;
    eventIds: string[];
    standings: CnaSeriesStandingsRowV1[];
    updatedAt: string;
};

