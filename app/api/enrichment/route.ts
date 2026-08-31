import { NextResponse } from "next/server";
import { getOutstandingSharesBatch } from "@/lib/secShares";
import { getFreeFloatBatch } from "@/lib/freeFloat";

export const runtime = "nodejs";
export const maxDuration = 15;

type Item = { ticker?: string; currentPrice?: number };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items: Item[] = Array.isArray(body?.items) ? body.items.slice(0, 7) : [];
    const tickers = [...new Set(items.map((x) => String(x.ticker || "").toUpperCase()).filter(Boolean))];
    if (!tickers.length) return NextResponse.json({ enrichment: {} });

    const [outstanding, freeFloat] = await Promise.all([
      withTimeout(getOutstandingSharesBatch(tickers), 4500, {}),
      withTimeout(getFreeFloatBatch(tickers), 4500, {})
    ]);

    const priceByTicker = Object.fromEntries(items.map((x) => [String(x.ticker || "").toUpperCase(), Number(x.currentPrice) || null]));
    const enrichment = Object.fromEntries(tickers.map((ticker) => {
      const os = (outstanding as any)[ticker];
      const ff = (freeFloat as any)[ticker];
      const price = priceByTicker[ticker];
      const floatShares = ff?.shares ?? null;
      return [ticker, {
        outstandingShares: os?.shares ?? null,
        outstandingSharesAsOf: os?.asOf ?? null,
        freeFloatShares: floatShares,
        freeFloatPercent: ff?.percent ?? null,
        freeFloatAsOf: ff?.asOf ?? null,
        floatMarketCap: floatShares != null && price != null ? floatShares * price : null
      }];
    }));

    return NextResponse.json({ enrichment });
  } catch (error) {
    console.error("enrichment error", error);
    return NextResponse.json({ enrichment: {} });
  }
}
