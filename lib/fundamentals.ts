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

function factByTags(cf: CompanyFacts, tags: string[], taxonomy = "us-gaap") {
  const group = cf.facts?.[taxonomy] || {};
  for (const tag of tags) if (group[tag]) return group[tag];
  return undefined;
}

function daySpan(r: UnitRow) {
  if (!r.start) return null;
  return Math.round((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86_400_000);
}

function latestDuration(cf: CompanyFacts, tags: string[]) {
  const rows = allUnits(factByTags(cf, tags))
    .filter((r) => ["10-Q", "10-K"].includes(r.form || "") && r.start && Number.isFinite(Number(r.val)))
    .sort((a, b) => new Date(b.filed || b.end).getTime() - new Date(a.filed || a.end).getTime());

  // Prefer a true quarter (~3 months), then annual period. This avoids using 6/9-month YTD values as a quarter.
  return rows.find((r) => { const d = daySpan(r); return d != null && d >= 70 && d <= 120; })
    || rows.find((r) => { const d = daySpan(r); return d != null && d >= 300 && d <= 390; })
    || rows[0];
}

function priorComparable(cf: CompanyFacts, tags: string[], latest?: UnitRow) {
  if (!latest) return undefined;
  const span = daySpan(latest);
  return allUnits(factByTags(cf, tags))
    .filter((r) => r !== latest && ["10-Q", "10-K"].includes(r.form || "") && r.start && Number.isFinite(Number(r.val)))
    .filter((r) => {
      const d = daySpan(r);
      return d != null && span != null && Math.abs(d - span) <= 15 && new Date(r.end) < new Date(latest.end);
    })
    .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];
}

function latestInstant(cf: CompanyFacts, tags: string[], taxonomy = "us-gaap") {
  return allUnits(factByTags(cf, tags, taxonomy))
    .filter((r) => ["10-Q", "10-K"].includes(r.form || "") && Number.isFinite(Number(r.val)))
    .sort((a, b) => new Date(b.filed || b.end).getTime() - new Date(a.filed || a.end).getTime())[0];
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
    const netIncomeRow = latestDuration(cf, ["NetIncomeLoss", "ProfitLoss"]);
    const epsRow = latestDuration(cf, ["EarningsPerShareDiluted"]);
    const grossProfitRow = latestDuration(cf, ["GrossProfit"]);
    const operatingIncomeRow = latestDuration(cf, ["OperatingIncomeLoss"]);
    const ocfRow = latestDuration(cf, ["NetCashProvidedByUsedInOperatingActivities"]);
    const capexRow = latestDuration(cf, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForPropertyPlantAndEquipment"]);

    const revenue = value(revenueRow);
    const grossProfit = value(grossProfitRow);
    const operatingIncome = value(operatingIncomeRow);
    const operatingCashFlow = value(ocfRow);
    const capex = value(capexRow);
    const freeCashFlow = operatingCashFlow != null && capex != null ? operatingCashFlow - Math.abs(capex) : null;

    const cash = value(latestInstant(cf, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]));
    const shortTermInvestments = value(latestInstant(cf, ["ShortTermInvestments", "MarketableSecuritiesCurrent"]));
    const shortTermDebt = value(latestInstant(cf, ["ShortTermBorrowings", "LongTermDebtCurrent", "ShortTermDebtCurrent"]));
    const longTermDebt = value(latestInstant(cf, ["LongTermDebtNoncurrent", "LongTermDebt"]));
    const totalDebt = shortTermDebt == null && longTermDebt == null ? null : (shortTermDebt || 0) + (longTermDebt || 0);
    const shares = value(latestInstant(cf, ["EntityCommonStockSharesOutstanding"], "dei"));

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
      grossMarginPct: pct(grossProfit, revenue),
      operatingIncome,
      operatingMarginPct: pct(operatingIncome, revenue),
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
