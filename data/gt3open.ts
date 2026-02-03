export type GT3Race = {
    round: number;
    track: string;
    trackKey?: string; // maps to /public/tracks/<trackKey>.png
    start: string; // ISO 8601 with timezone, e.g. "2026-01-10T20:00:00-05:00"
    format?: string; // e.g. "Q + R"
    note?: string;
    broadcast?: string; // stream link optional
};

export const gt3open = {
    seriesName: "CNA GT3 Open",
    seasonName: "Season 26S1",
    races: [
        {
            round: 1,
            track: "Autodromo Internazionale Enzo e Dino Ferrari 伊莫拉",
            trackKey: "imola",
            start: "2025-12-21T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
            note: "揭幕战",
        },
        {
            round: 2,
            track: "Silverstone Circuit 银石",
            trackKey: "silverstone",
            start: "2025-12-28T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 3,
            track: "Circuit des 24 Heures du Mans 勒芒",
            trackKey: "lemans",
            start: "2026-01-04T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 4,
            track: "Circuit de Spa-Francorchamps 斯帕",
            trackKey: "spa",
            start: "2026-01-11T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 5,
            track: "Daytona International Speedway 代托纳",
            trackKey: "daytona",
            start: "2026-01-18T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 6,
            track: "Suzuka International Racing Course 铃鹿",
            trackKey: "suzuka",
            start: "2026-01-25T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 7,
            track: "Autodromo Nazionale Monza 蒙扎",
            trackKey: "monza",
            start: "2026-02-01T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 8,
            track: "Virginia International Raceway VIR",
            trackKey: "vir",
            start: "2026-02-08T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 9,
            track: "Mount Panorama Circuit 巴瑟斯特",
            trackKey: "mount-p",
            start: "2026-02-15T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 10,
            track: "Nürburgring Grand Prix Strecke 纽博格林GP",
            trackKey: "nur-gp",
            start: "2026-02-22T03:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 11,
            track: "Okayama International Circuit 冈山",
            trackKey: "okayama",
            start: "2026-03-01T04:59:00Z",
            format: "P(60分钟) + Q(20分钟) + R(40分钟,强制1停)",
        },
        {
            round: 12,
            track: "Nürburgring Combined 纽博格林综合",
            trackKey: "nur-n",
            start: "2026-03-08T04:59:00Z",
            format: "P(10分钟) + Q(30分钟) + R(80分钟)",
            note: "收官战",
        },
    ] as GT3Race[],
};



