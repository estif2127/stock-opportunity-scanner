import "server-only";
import type { StructuredFundamentals } from "./types";

const SEC_BASE = "https://data.sec.gov";
const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";

const SEC_HEADERS = {
  "User-Agent": process.env.SEC_USER_AGENT || "StockOpportunityScanner/1.0 research@example.com",
  "Accept-Encoding": "gzip, deflate",
  Accept: "application/json"
};

type TickerRow = { cik_str: number; ticker: string; title: string };
type UnitRow = {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};
type Fact = { label?: string; description?: string; units?: Record<string, UnitRow[]> };
type CompanyFacts = {
  entityName?: string;
  facts?: Record<string, Record<string, Fact>>;
};

let tickerCache: { expires: number; rows: TickerRow[] } | null = null;
const factsCache = new Map<string, { expires: number; value: CompanyFacts }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

async function secJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: SEC_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) throw new Error(`SEC ${res.status}: ${(await res.text()).slice(0, 220)}`);
  return res.json() as Promise<T>;
}

async function resolveTicker(ticker: string) {
  if (!tickerCache || tickerCache.expires < Date.now()) {
    const raw = await secJson<Record<string, TickerRow>>(SEC_TICKERS);
    tickerCache = { expires: Date.now() + CACHE_MS, rows: Object.values(raw) };
  }
  const row = tickerCache.rows.find((r) => r.ticker.toUpperCase() === ticker.toUpperCase());
  if (!row) throw new Error(`SEC CIK not found for ${ticker}`);
  return { ...row, cik: String(row.cik_str).padStart(10, "0") };
}

async function companyFacts(cik: string) {
  const cached = factsCache.get(cik);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await secJson<CompanyFacts>(`${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`);
  factsCache.set(cik, { expires: Date.now() + CACHE_MS, value });
  return value;
}

function allUnits(fact?: Fact): UnitRow[] {
  if (!fact?.units) return [];
  return Object.values(fact.units).flat();
}

function factsByTags(cf: CompanyFacts, tags: string[], taxonomy = "us-gaap") {
  const group = cf.facts?.[taxonomy] || {};
  return tags.map((tag) => group[tag]).filter(Boolean) as Fact[];
}

function rowsByTags(cf: CompanyFacts, tags: string[], taxonomy = "us-gaap") {
  return factsByTags(cf, tags, taxonomy).flatMap(allUnits);
}

function daySpan(r: UnitRow) {
  if (!r.start) return null;
  return Math.round((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86_400_000);
}

function filingTime(r: UnitRow) {
  return new Date(r.filed || r.end).getTime();
}

function validDurationRows(cf: CompanyFacts, tags: string[]) {
  return rowsByTags(cf, tags)
    .filter((r) => ["10-Q", "10-K"].includes(r.form || "") && r.start && Number.isFinite(Number(r.val)));
}

function latestDuration(cf: CompanyFacts, tags: string[]) {
  const rows = validDurationRows(cf, tags)
    .sort((a, b) => filingTime(b) - filingTime(a));

  // Prefer the newest true quarter. If the company does not provide a quarter value,
  // use the newest annual value. Never prefer an older tag merely because it appears
  // first in the tag list.
  const quarterRows = rows.filter((r) => {
    const d = daySpan(r);
    return d != null && d >= 70 && d <= 120;
  });
  if (quarterRows.length) return quarterRows[0];

  const annualRows = rows.filter((r) => {
    const d = daySpan(r);
    return d != null && d >= 300 && d <= 390;
  });
  return annualRows[0] || rows[0];
}

function samePeriodDuration(cf: CompanyFacts, tags: string[], anchor?: UnitRow) {
  if (!anchor?.start || !anchor.end) return undefined;
  const anchorSpan = daySpan(anchor);
  if (anchorSpan == null) return undefined;

  return validDurationRows(cf, tags)
    .filter((r) => r.end === anchor.end)
    .filter((r) => {
      const d = daySpan(r);
      return d != null && Math.abs(d - anchorSpan) <= 15;
    })
    .sort((a, b) => {
      // Prefer a row filed with the same accession/form as the anchor, then newest filing.
      const aMatch = Number(Boolean(anchor.accn && a.accn === anchor.accn)) + Number(Boolean(anchor.form && a.form === anchor.form));
      const bMatch = Number(Boolean(anchor.accn && b.accn === anchor.accn)) + Number(Boolean(anchor.form && b.form === anchor.form));
      return bMatch - aMatch || filingTime(b) - filingTime(a);
    })[0];
}

function priorComparable(cf: CompanyFacts, tags: string[], latest?: UnitRow) {
  if (!latest) return undefined;
  const span = daySpan(latest);
  if (span == null) return undefined;
  const target = new Date(latest.end);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const targetMs = target.getTime();

  return validDurationRows(cf, tags)
    .filter((r) => {
      const d = daySpan(r);
      if (d == null || Math.abs(d - span) > 15) return false;
      const endMs = new Date(r.end).getTime();
      return endMs < new Date(latest.end).getTime() && Math.abs(endMs - targetMs) <= 60 * 86_400_000;
    })
    .sort((a, b) => Math.abs(new Date(a.end).getTime() - targetMs) - Math.abs(new Date(b.end).getTime() - targetMs))[0];
}

function latestInstant(cf: CompanyFacts, tags: string[], taxonomy = "us-gaap", anchorEnd?: string) {
  const rows = rowsByTags(cf, tags, taxonomy)
    .filter((r) => ["10-Q", "10-K"].includes(r.form || "") && Number.isFinite(Number(r.val)));

  const aligned = anchorEnd ? rows.filter((r) => r.end === anchorEnd) : [];
  return (aligned.length ? aligned : rows)
    .sort((a, b) => filingTime(b) - filingTime(a))[0];
}

function value(r?: UnitRow) { return r && Number.isFinite(Number(r.val)) ? Number(r.val) : null; }
function growth(cur: number | null, prev: number | null) {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
function pct(a: number | null, b: number | null) {
  if (a == null || b == null || b === 0) return null;
  return (a / b) * 100;
}

export async function getStructuredFundamentals(ticker: string): Promise<StructuredFundamentals> {
  try {
    const company = await resolveTicker(ticker);
    const cf = await companyFacts(company.cik);

    const revenueTags = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"];
    const revenueRow = latestDuration(cf, revenueTags);
    const priorRevenueRow = priorComparable(cf, revenueTags, revenueRow);

    // Anchor every duration metric to the same reporting period as revenue.
    // This prevents impossible ratios caused by combining, for example, 2018 revenue
    // with 2026 net income or cash flow.
    const netIncomeRow = samePeriodDuration(cf, ["NetIncomeLoss", "ProfitLoss"], revenueRow);
    const epsRow = samePeriodDuration(cf, ["EarningsPerShareDiluted"], revenueRow);
    const grossProfitRow = samePeriodDuration(cf, ["GrossProfit"], revenueRow);
    const operatingIncomeRow = samePeriodDuration(cf, ["OperatingIncomeLoss"], revenueRow);
    const ocfRow = samePeriodDuration(cf, ["NetCashProvidedByUsedInOperatingActivities"], revenueRow);
    const capexRow = samePeriodDuration(cf, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForPropertyPlantAndEquipment"], revenueRow);

    const revenue = value(revenueRow);
    const grossProfit = value(grossProfitRow);
    const operatingIncome = value(operatingIncomeRow);
    const operatingCashFlow = value(ocfRow);
    const capex = value(capexRow);
    const freeCashFlow = operatingCashFlow != null && capex != null ? operatingCashFlow - Math.abs(capex) : null;

    const anchorEnd = revenueRow?.end;
    const cash = value(latestInstant(cf, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], "us-gaap", anchorEnd));
    const shortTermInvestments = value(latestInstant(cf, ["ShortTermInvestments", "MarketableSecuritiesCurrent"], "us-gaap", anchorEnd));
    const shortTermDebt = value(latestInstant(cf, ["ShortTermBorrowings", "LongTermDebtCurrent", "ShortTermDebtCurrent"], "us-gaap", anchorEnd));
    const longTermDebt = value(latestInstant(cf, ["LongTermDebtNoncurrent", "LongTermDebt"], "us-gaap", anchorEnd));
    const totalDebt = shortTermDebt == null && longTermDebt == null ? null : (shortTermDebt || 0) + (longTermDebt || 0);
    const shares = value(latestInstant(cf, ["EntityCommonStockSharesOutstanding"], "dei", anchorEnd));

    const period = revenueRow?.end ? `${revenueRow.form || "SEC filing"} period ended ${revenueRow.end}` : undefined;

    return {
      available: Boolean(revenueRow || netIncomeRow || cash != null),
      source: "SEC Companyfacts (XBRL)",
      companyName: cf.entityName || company.title,
      reportingCurrency: "USD",
      period,
      priorComparablePeriod: priorRevenueRow?.end,
      revenue,
      revenueGrowthYoY: growth(revenue, value(priorRevenueRow)),
      netIncome: value(netIncomeRow),
      epsDiluted: value(epsRow),
      grossProfit,
      grossMarginPct: (() => { const m = pct(grossProfit, revenue); return m != null && m >= -100 && m <= 100 ? m : null; })(),
      operatingIncome,
      operatingMarginPct: (() => { const m = pct(operatingIncome, revenue); return m != null && m >= -100 && m <= 100 ? m : null; })(),
      freeCashFlow,
      operatingCashFlow,
      capex,
      cash,
      shortTermInvestments,
      shortTermDebt,
      longTermDebt,
      totalDebt,
      marketCap: null,
      enterpriseValue: null,
      peRatio: null,
      pbRatio: null,
      trailingPEG1Y: null,
      sharesDiluted: shares
    };
  } catch (error) {
    return {
      available: false,
      source: "SEC Companyfacts (XBRL)",
      error: error instanceof Error ? error.message : "SEC structured fundamentals unavailable"
    };
  }
}
