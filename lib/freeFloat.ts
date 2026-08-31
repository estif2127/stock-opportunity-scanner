import "server-only";

const ORTEX_BASE = "https://api.ortex.com/api/v1/stock/us";

type FloatRow = Record<string, unknown>;

export type FreeFloatResult = {
  shares: number | null;
  percent: number | null;
  asOf: string | null;
  source: "ORTEX";
};

const cache = new Map<string, { value: FreeFloatResult; loadedAt: number }>();

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function text(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return null;
}

function rowsFromPayload(payload: unknown): FloatRow[] {
  if (Array.isArray(payload)) return payload.filter((x): x is FloatRow => Boolean(x && typeof x === "object"));
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  for (const key of ["results", "data", "items"]) {
    if (Array.isArray(p[key])) return (p[key] as unknown[]).filter((x): x is FloatRow => Boolean(x && typeof x === "object"));
  }
  return [p];
}

function parseLatest(payload: unknown): FreeFloatResult {
  const rows = rowsFromPayload(payload);
  rows.sort((a, b) => new Date(text(b.date, b.as_of, b.asOf) || 0).getTime() - new Date(text(a.date, a.as_of, a.asOf) || 0).getTime());
  const r = rows[0] || {};
  return {
    shares: num(r.free_float_shares, r.freeFloatShares, r.free_float, r.freeFloat, r.float_shares, r.floatShares),
    percent: num(r.free_float_percent_of_outstanding, r.freeFloatPercentOfOutstanding, r.free_float_percent, r.freeFloatPercent),
    asOf: text(r.date, r.as_of, r.asOf, r.effective_date, r.effectiveDate),
    source: "ORTEX"
  };
}

function dateOnly(d: Date) { return d.toISOString().slice(0, 10); }

export async function getFreeFloat(ticker: string): Promise<FreeFloatResult> {
  const symbol = ticker.toUpperCase();
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.loadedAt < 6 * 60 * 60 * 1000) return cached.value;

  try {
    const end = new Date();
    const start = new Date(end.getTime() - 45 * 24 * 60 * 60 * 1000);
    const key = process.env.ORTEX_API_KEY || "TEST";
    const url = `${ORTEX_BASE}/${encodeURIComponent(symbol)}/free_float?from_date=${dateOnly(start)}&to_date=${dateOnly(end)}&page_size=100`;
    const res = await fetch(url, {
      headers: { "Ortex-Api-Key": key, Accept: "application/json" },
      next: { revalidate: 6 * 60 * 60 }
    });
    if (!res.ok) throw new Error(`ORTEX ${res.status}`);
    const value = parseLatest(await res.json());
    cache.set(symbol, { value, loadedAt: Date.now() });
    return value;
  } catch {
    return { shares: null, percent: null, asOf: null, source: "ORTEX" };
  }
}

export async function getFreeFloatBatch(tickers: string[]) {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const pairs = await Promise.all(unique.map(async (ticker) => [ticker, await getFreeFloat(ticker)] as const));
  return Object.fromEntries(pairs) as Record<string, FreeFloatResult>;
}
