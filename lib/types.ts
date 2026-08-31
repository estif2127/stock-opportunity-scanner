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
  outstandingShares?: number | null;
  outstandingSharesAsOf?: string | null;
  freeFloatShares?: number | null;
  freeFloatPercent?: number | null;
  freeFloatAsOf?: string | null;
  floatMarketCap?: number | null;
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


export type StructuredFundamentals = {
  available: boolean;
  source: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  reportingCurrency?: string;
  period?: string;
  priorComparablePeriod?: string;
  revenue?: number | null;
  revenueGrowthYoY?: number | null;
  netIncome?: number | null;
  epsDiluted?: number | null;
  grossProfit?: number | null;
  grossMarginPct?: number | null;
  operatingIncome?: number | null;
  operatingMarginPct?: number | null;
  freeCashFlow?: number | null;
  operatingCashFlow?: number | null;
  capex?: number | null;
  cash?: number | null;
  shortTermInvestments?: number | null;
  shortTermDebt?: number | null;
  longTermDebt?: number | null;
  totalDebt?: number | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  trailingPEG1Y?: number | null;
  sharesDiluted?: number | null;
  error?: string;
};

export type ResearchSource = {
  title: string;
  url: string;
  domain: string;
  category: "SEC" | "Company" | "FDA" | "ClinicalTrials" | "News" | "Other";
};


export type QuickStockSnapshot = {
  ticker: string;
  generatedAt: string;
  currentPrice: number;
  changePct: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  bars: Bar[];
  technical: {
    score: number;
    vwap: number | null;
    aboveVwap: boolean | null;
    rvol: number | null;
    rvolVerified: boolean;
    distanceFromHodPct: number;
    spreadPct: number | null;
    volumeAcceleration: number | null;
    higherLows: boolean | null;
    reasons: string[];
    warnings: string[];
  };
  news: NewsItem[];
};

export type SingleStockReport = {
  ticker: string;
  companyName: string;
  generatedAt: string;
  currentPrice: number;
  changePct: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  bars: Bar[];
  technical: {
    score: number;
    vwap: number | null;
    aboveVwap: boolean | null;
    rvol: number | null;
    rvolVerified: boolean;
    distanceFromHodPct: number;
    spreadPct: number | null;
    volumeAcceleration: number | null;
    higherLows: boolean | null;
    reasons: string[];
    warnings: string[];
  };
  verdict: "Strong" | "Watch" | "Avoid";
  confidence: number;
  thesis: string;
  whyMoving: string;
  catalyst: {
    type: string;
    status: "Confirmed" | "Partially confirmed" | "Unconfirmed";
    freshness: string;
    qualityScore: number;
    summary: string;
  };
  fundamentals: {
    revenue: string;
    earnings: string;
    margins: string;
    freeCashFlow: string;
    cashAndDebt: string;
    valuation: string;
    guidance: string;
    competitivePosition: string;
  };
  priceVsBusinessDamage: {
    conclusion: string;
    priceDamage: string;
    businessDamage: string;
    assessment: "Price damage worse" | "Roughly aligned" | "Business damage worse" | "Not applicable";
  };
  capitalStructure: {
    risk: "Low" | "Medium" | "High" | "Unknown";
    summary: string;
    flags: string[];
  };
  biotech: {
    relevant: boolean;
    scientificQuality: string;
    capitalQuality: string;
    trialContext: string;
    fdaStatus: string;
    cashRunway: string;
    warnings: string[];
  };
  bullCase: string[];
  bearCase: string[];
  upcomingCatalysts: string[];
  whatChangesThesis: string[];
  preferredEntry: string;
  invalidation: string;
  targets: string[];
  riskReward: string;
  sources: ResearchSource[];
  news: NewsItem[];
};
