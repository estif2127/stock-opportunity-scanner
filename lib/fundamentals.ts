import "server-only";
import type { StructuredFundamentals } from "./types";

const BASE = "https://api.tiingo.com";

function token() {
  const value = process.env.TIINGO_API_KEY;
  if (!value) throw new Error("Missing TIINGO_API_KEY");
  return value;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Token ${token()}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tiingo fundamentals ${res.status}: ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<T>;
}

type Definition = { dataCode: string; name: string; statementType?: string; units?: string };
type DataPoint = { dataCode: string; value: number | null };
type Statement = {
  date: string;
  quarter: number;
  year: number;
  statementData?: {
    balanceSheet?: DataPoint[];
    incomeStatement?: DataPoint[];
    cashFlow?: DataPoint[];
    overview?: DataPoint[];
  };
};
type DailyFundamental = {
  date: string;
  marketCap?: number | null;
  enterpriseVal?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  trailingPEG1Y?: number | null;
  [key: string]: unknown;
};
function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildCodeLookup(defs: Definition[]) {
  const entries = defs.map((d) => ({ code: d.dataCode, name: norm(d.name || d.dataCode) }));
  const find = (...names: string[]) => {
    for (const wanted of names.map(norm)) {
      const exact = entries.find((e) => e.name === wanted);
      if (exact) return exact.code;
    }
    for (const wanted of names.map(norm)) {
      const fuzzy = entries.find((e) => e.name.includes(wanted) || wanted.includes(e.name));
      if (fuzzy) return fuzzy.code;
    }
    return undefined;
  };
  return { find };
}

function points(stmt: Statement | undefined) {
  const all = [
    ...(stmt?.statementData?.incomeStatement || []),
    ...(stmt?.statementData?.balanceSheet || []),
    ...(stmt?.statementData?.cashFlow || []),
    ...(stmt?.statementData?.overview || [])
  ];
  return new Map(all.map((p) => [p.dataCode, Number.isFinite(Number(p.value)) ? Number(p.value) : null]));
}

function get(map: Map<string, number | null>, code?: string) {
  return code ? (map.get(code) ?? null) : null;
}

function pct(num: number | null, den: number | null) {
  if (num == null || den == null || den === 0) return null;
  return (num / den) * 100;
}

function growth(cur: number | null, old: number | null) {
  if (cur == null || old == null || old === 0) return null;
  return ((cur - old) / Math.abs(old)) * 100;
}

function latestQuarter(statements: Statement[]) {
  return [...statements]
    .filter((s) => Number(s.quarter) >= 1 && Number(s.quarter) <= 4)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

function comparable(statements: Statement[], latest?: Statement) {
  if (!latest) return undefined;
  return statements.find((s) => Number(s.quarter) === Number(latest.quarter) && Number(s.year) === Number(latest.year) - 1);
}

function latestDaily(rows: DailyFundamental[]) {
  return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

export async function getStructuredFundamentals(ticker: string): Promise<StructuredFundamentals> {
  try {
    const encoded = encodeURIComponent(ticker.toUpperCase());
    const nowDate = new Date();
    const statementStart = new Date(nowDate.getTime() - 850 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyStart = new Date(nowDate.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [defs, statements, daily] = await Promise.all([
      fetchJson<Definition[]>("/tiingo/fundamentals/definitions"),
      fetchJson<Statement[]>(`/tiingo/fundamentals/${encoded}/statements?startDate=${statementStart}`),
      fetchJson<DailyFundamental[]>(`/tiingo/fundamentals/${encoded}/daily?startDate=${dailyStart}`)
    ]);

    const latest = latestQuarter(statements || []);
    if (!latest) return { available: false, source: "Tiingo Fundamentals", error: "No quarterly statement returned." };
    const prior = comparable(statements || [], latest);
    const now = points(latest);
    const prev = points(prior);
    const codes = buildCodeLookup(defs || []);

    const revenueCode = codes.find("Revenue");
    const netIncomeCode = codes.find("Net Income", "Net Income Common Stock");
    const epsDilutedCode = codes.find("Earnings Per Share Diluted", "Diluted EPS");
    const grossProfitCode = codes.find("Gross Profit");
    const operatingIncomeCode = codes.find("Operating Income");
    const fcfCode = codes.find("Free Cash Flow");
    const ocfCode = codes.find("Net Cash Flow From Operations", "Operating Cash Flow");
    const capexCode = codes.find("Capital Expenditure Capex", "Capital Expenditure");
    const cashCode = codes.find("Cash Cash Equivalents", "Cash & Cash Equivalents", "Cash and Cash Equivalents");
    const stiCode = codes.find("Short term Investments", "Short-Term Investments");
    const stdCode = codes.find("Short term Debt", "Short-Term Debt");
    const ltdCode = codes.find("Long term Debt", "Long-Term Debt");
    const sharesCode = codes.find("Weighted Average Shares Diluted", "Weighted Average Shares (Diluted)");

    const revenue = get(now, revenueCode);
    const priorRevenue = get(prev, revenueCode);
    const grossProfit = get(now, grossProfitCode);
    const operatingIncome = get(now, operatingIncomeCode);
    const ocf = get(now, ocfCode);
    const capexRaw = get(now, capexCode);
    let fcf = get(now, fcfCode);
    if (fcf == null && ocf != null && capexRaw != null) fcf = ocf + capexRaw; // capex is commonly reported negative

    const cash = get(now, cashCode);
    const shortTermInvestments = get(now, stiCode);
    const shortTermDebt = get(now, stdCode);
    const longTermDebt = get(now, ltdCode);
    const totalDebt = shortTermDebt == null && longTermDebt == null ? null : (shortTermDebt || 0) + (longTermDebt || 0);
    const dailyNow = latestDaily(daily || []);
    return {
      available: true,
      source: "Tiingo Fundamentals",
      reportingCurrency: "USD",
      period: `FY${latest.year} Q${latest.quarter}`,
      priorComparablePeriod: prior ? `FY${prior.year} Q${prior.quarter}` : undefined,
      revenue,
      revenueGrowthYoY: growth(revenue, priorRevenue),
      netIncome: get(now, netIncomeCode),
      epsDiluted: get(now, epsDilutedCode),
      grossProfit,
      grossMarginPct: pct(grossProfit, revenue),
      operatingIncome,
      operatingMarginPct: pct(operatingIncome, revenue),
      freeCashFlow: fcf,
      operatingCashFlow: ocf,
      capex: capexRaw,
      cash,
      shortTermInvestments,
      shortTermDebt,
      longTermDebt,
      totalDebt,
      marketCap: Number.isFinite(Number(dailyNow?.marketCap)) ? Number(dailyNow?.marketCap) : null,
      enterpriseValue: Number.isFinite(Number(dailyNow?.enterpriseVal)) ? Number(dailyNow?.enterpriseVal) : null,
      peRatio: Number.isFinite(Number(dailyNow?.peRatio)) ? Number(dailyNow?.peRatio) : null,
      pbRatio: Number.isFinite(Number(dailyNow?.pbRatio)) ? Number(dailyNow?.pbRatio) : null,
      trailingPEG1Y: Number.isFinite(Number(dailyNow?.trailingPEG1Y)) ? Number(dailyNow?.trailingPEG1Y) : null,
      sharesDiluted: get(now, sharesCode)
    };
  } catch (error) {
    return {
      available: false,
      source: "Tiingo Fundamentals",
      error: error instanceof Error ? error.message : "Structured fundamentals unavailable"
    };
  }
}
