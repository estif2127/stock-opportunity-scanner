import "server-only";

const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";
const SEC_FACTS = "https://data.sec.gov/api/xbrl/companyfacts";
const USER_AGENT = "StockPlug stock research app support@stockplug.app";

type TickerRow = { cik_str: number; ticker: string; title: string };
type TickerMapResponse = Record<string, TickerRow>;
type FactUnit = {
  val?: number;
  end?: string;
  filed?: string;
  form?: string;
  fy?: number;
  fp?: string;
};
type CompanyFacts = {
  facts?: Record<string, Record<string, { units?: Record<string, FactUnit[]> }>>;
};

export type OutstandingSharesResult = {
  shares: number | null;
  asOf: string | null;
  source: "SEC XBRL";
};

let tickerMapCache: Map<string, string> | null = null;
let tickerMapLoadedAt = 0;
const shareCache = new Map<string, { value: OutstandingSharesResult; loadedAt: number }>();

async function secFetch<T>(url: string, revalidateSeconds: number): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip, deflate",
      Accept: "application/json"
    },
    next: { revalidate: revalidateSeconds }
  });
  if (!res.ok) throw new Error(`SEC ${res.status}`);
  return res.json() as Promise<T>;
}

async function getTickerMap() {
  const now = Date.now();
  if (tickerMapCache && now - tickerMapLoadedAt < 24 * 60 * 60 * 1000) return tickerMapCache;
  const raw = await secFetch<TickerMapResponse>(SEC_TICKERS, 24 * 60 * 60);
  const map = new Map<string, string>();
  for (const row of Object.values(raw || {})) {
    if (!row?.ticker || row?.cik_str == null) continue;
    map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  tickerMapCache = map;
  tickerMapLoadedAt = now;
  return map;
}

function latestShareFact(facts: CompanyFacts): FactUnit | null {
  const pools: FactUnit[][] = [];
  const dei = facts.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares;
  const gaap = facts.facts?.["us-gaap"]?.CommonStockSharesOutstanding?.units?.shares;
  if (dei?.length) pools.push(dei);
  if (gaap?.length) pools.push(gaap);

  const rows = pools.flat().filter((r) => Number.isFinite(Number(r.val)) && Number(r.val) > 0);
  rows.sort((a, b) => {
    const aDate = new Date(a.filed || a.end || 0).getTime();
    const bDate = new Date(b.filed || b.end || 0).getTime();
    return bDate - aDate;
  });
  return rows[0] || null;
}

export async function getOutstandingShares(ticker: string): Promise<OutstandingSharesResult> {
  const symbol = ticker.toUpperCase();
  const cached = shareCache.get(symbol);
  if (cached && Date.now() - cached.loadedAt < 6 * 60 * 60 * 1000) return cached.value;

  try {
    const map = await getTickerMap();
    const cik = map.get(symbol);
    if (!cik) return { shares: null, asOf: null, source: "SEC XBRL" };

    const facts = await secFetch<CompanyFacts>(`${SEC_FACTS}/CIK${cik}.json`, 6 * 60 * 60);
    const latest = latestShareFact(facts);
    const value: OutstandingSharesResult = latest
      ? { shares: Number(latest.val), asOf: latest.end || latest.filed || null, source: "SEC XBRL" }
      : { shares: null, asOf: null, source: "SEC XBRL" };
    shareCache.set(symbol, { value, loadedAt: Date.now() });
    return value;
  } catch {
    return { shares: null, asOf: null, source: "SEC XBRL" };
  }
}

export async function getOutstandingSharesBatch(tickers: string[]) {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const pairs = await Promise.all(unique.map(async (ticker) => [ticker, await getOutstandingShares(ticker)] as const));
  return Object.fromEntries(pairs) as Record<string, OutstandingSharesResult>;
}
