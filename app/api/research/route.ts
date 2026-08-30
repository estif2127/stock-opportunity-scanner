import { NextRequest, NextResponse } from "next/server";
import { getAllSnapshots, getBars, getNews } from "@/lib/tiingo";
import { buildCandidate } from "@/lib/technicals";
import { deepResearchStock, fallbackReport } from "@/lib/singleResearch";
import type { Candidate, QuickStockSnapshot, SingleStockReport } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function yyyyMmDd(d: Date) { return d.toISOString().slice(0, 10); }

const deepCache = new Map<string, { expires: number; report: SingleStockReport }>();
const CACHE_MS = 45 * 60 * 1000;

async function loadCandidate(ticker: string): Promise<Candidate> {
  const snapshots = await getAllSnapshots();
  const snapshot = snapshots.find((s) => s.ticker.toUpperCase() === ticker);
  if (!snapshot || snapshot.tngoLast == null || snapshot.prevClose == null || snapshot.high == null || snapshot.low == null || snapshot.volume == null) {
    throw new Error(`${ticker} was not found in the current Tiingo equity snapshot.`);
  }

  const end = new Date();
  const start = new Date(end.getTime() - 18 * 24 * 60 * 60 * 1000);
  const [bars, news] = await Promise.all([
    getBars(ticker, yyyyMmDd(start), yyyyMmDd(end)),
    getNews([ticker])
  ]);

  const candidate = buildCandidate(snapshot, bars);
  candidate.news = news
    .filter((n) => !n.tickers?.length || n.tickers.some((t) => t.toUpperCase() === ticker))
    .slice(0, 8);
  return candidate;
}

function quickSnapshot(candidate: Candidate): QuickStockSnapshot {
  return {
    ticker: candidate.ticker,
    generatedAt: new Date().toISOString(),
    currentPrice: candidate.currentPrice,
    changePct: candidate.changePct,
    high: candidate.high,
    low: candidate.low,
    prevClose: candidate.prevClose,
    volume: candidate.volume,
    bars: candidate.bars,
    technical: {
      score: candidate.technicalScore,
      vwap: candidate.vwap,
      aboveVwap: candidate.aboveVwap,
      rvol: candidate.rvol,
      rvolVerified: candidate.rvolVerified,
      distanceFromHodPct: candidate.distanceFromHodPct,
      spreadPct: candidate.spreadPct,
      volumeAcceleration: candidate.volumeAcceleration,
      higherLows: candidate.higherLows,
      reasons: candidate.technicalReasons,
      warnings: candidate.warnings
    },
    news: candidate.news
  };
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json();
    const ticker = String(body?.ticker || "").trim().toUpperCase();
    const mode = body?.mode === "deep" ? "deep" : "quick";

    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      return NextResponse.json({ error: "Enter a valid U.S. ticker symbol." }, { status: 400 });
    }

    if (mode === "deep") {
      const cached = deepCache.get(ticker);
      if (cached && cached.expires > Date.now()) {
        return NextResponse.json({ report: cached.report, cached: true, elapsedMs: Date.now() - started });
      }
    }

    const candidate = await loadCandidate(ticker);

    if (mode === "quick") {
      return NextResponse.json({ snapshot: quickSnapshot(candidate), elapsedMs: Date.now() - started });
    }

    // Hard route-level guard: never let deep research consume Vercel's full function window.
    // Even if an upstream web-search request ignores/defers abort, the API returns a
    // conservative partial report to the browser after ~65 seconds.
    const HARD_ROUTE_BUDGET_MS = 65_000;
    const report = await Promise.race<SingleStockReport>([
      deepResearchStock(candidate),
      new Promise<SingleStockReport>((resolve) =>
        setTimeout(() =>
          resolve(fallbackReport(candidate,
            "The 60-second research budget was reached. A partial report was returned instead of waiting for the upstream research request."
          )), HARD_ROUTE_BUDGET_MS)
      )
    ]);

    // Cache completed and partial reports briefly so repeated clicks do not immediately
    // start another expensive research request.
    deepCache.set(ticker, { expires: Date.now() + CACHE_MS, report });
    return NextResponse.json({ report, cached: false, elapsedMs: Date.now() - started });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Research failed";
    const status = message.includes("was not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
