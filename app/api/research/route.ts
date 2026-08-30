import { NextRequest, NextResponse } from "next/server";
import { getAllSnapshots, getBars, getNews } from "@/lib/tiingo";
import { buildCandidate } from "@/lib/technicals";
import { deepResearchStock } from "@/lib/singleResearch";

export const runtime = "nodejs";
export const maxDuration = 300;

function yyyyMmDd(d: Date) { return d.toISOString().slice(0, 10); }

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json();
    const ticker = String(body?.ticker || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      return NextResponse.json({ error: "Enter a valid U.S. ticker symbol." }, { status: 400 });
    }

    const snapshots = await getAllSnapshots();
    const snapshot = snapshots.find((s) => s.ticker.toUpperCase() === ticker);
    if (!snapshot || snapshot.tngoLast == null || snapshot.prevClose == null || snapshot.high == null || snapshot.low == null || snapshot.volume == null) {
      return NextResponse.json({ error: `${ticker} was not found in the current Tiingo equity snapshot.` }, { status: 404 });
    }

    const end = new Date();
    const start = new Date(end.getTime() - 18 * 24 * 60 * 60 * 1000);
    const [bars, news] = await Promise.all([
      getBars(ticker, yyyyMmDd(start), yyyyMmDd(end)),
      getNews([ticker])
    ]);

    const candidate = buildCandidate(snapshot, bars);
    candidate.news = news.filter((n) => !n.tickers?.length || n.tickers.some((t) => t.toUpperCase() === ticker)).slice(0, 10);
    const report = await deepResearchStock(candidate);

    return NextResponse.json({ report, elapsedMs: Date.now() - started });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 500 });
  }
}
