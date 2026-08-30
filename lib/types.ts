export type Snapshot = {
  ticker: string;
  timestamp: string;
  tngoLast: number | null;
  lqRefPrice: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  lqSpread: number | null;
  lqBidPrice: number | null;
  lqAskPrice: number | null;
};

export type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NewsItem = {
  title: string;
  description?: string;
  url?: string;
  source?: string;
  publishedDate?: string;
  tickers?: string[];
  tags?: string[];
};

export type PrimarySource = {
  title: string;
  url: string;
  domain: string;
  sourceType: "SEC" | "FDA" | "ClinicalTrials" | "Company" | "Other";
};

export type TrialEvidence = {
  nctId?: string;
  phase?: string;
  enrollment?: number | null;
  status?: string;
  summary?: string;
};

export type CatalystResearch = {
  checkedAt: string;
  companyName: string;
  status: "Confirmed" | "Partially confirmed" | "Unconfirmed";
  catalystType: string;
  summary: string;
  sourceQuality: "High" | "Medium" | "Low";
  significanceScore: number;
  freshness: string;
  primarySources: PrimarySource[];
  secFindings: string[];
  dilutionFlags: string[];
  warnings: string[];
  biotech: {
    relevant: boolean;
    fdaSummary: string;
    trials: TrialEvidence[];
    smallDatasetWarning: boolean;
  };
};

export type Candidate = {
  ticker: string;
  currentPrice: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  prevClose: number;
  distanceFromHodPct: number;
  spreadPct: number | null;
  dollarVolume: number;
  vwap: number | null;
  rvol: number | null;
  rvolVerified: boolean;
  volumeAcceleration: number | null;
  higherLows: boolean | null;
  aboveVwap: boolean | null;
  technicalScore: number;
  technicalReasons: string[];
  warnings: string[];
  news: NewsItem[];
  bars: Bar[];
  research?: CatalystResearch;
  ai?: {
    rating: "Strong" | "Watch" | "Avoid";
    summary: string;
    whyMoving: string;
    catalyst: string;
    majorRisk: string;
    capitalStructureRisk: string;
    entryTrigger: string;
    invalidation: string;
    targets: string[];
    riskReward: string;
    confidence: number;
  };
};
