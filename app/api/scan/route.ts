import { NextResponse } from "next/server";
import { analyzeCandidates } from "@/lib/ai";
import { verifyCatalysts } from "@/lib/research";
import { getAllSnapshots, getBars, getNews } from "@/lib/tiingo";
import { buildCandidate, discoveryFilter, rankDiscovery } from "@/lib/technicals";
import type { Candidate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function yyyyMmDd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  const started = Date.now();
  try {
    const snapshots = await getAllSnapshots();
    const discovered = snapshots
      .filter(discoveryFilter)
      .sort((a, b) => rankDiscovery(b) - rankDiscovery(a));

    const shortlist = discovered.slice(0, 12);
    const end = new Date();
    const start = new Date(end.getTime() - 18 * 24 * 60 * 60 * 1000);

    const validatedRaw = await Promise.allSettled(
      shortlist.map(async (s) => {
        const bars = await getBars(s.ticker, yyyyMmDd(start), yyyyMmDd(end));
        return buildCandidate(s, bars);
      })
    );

    let candidates: Candidate[] = validatedRaw
      .filter((r): r is PromiseFulfilledResult<Candidate> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => b.technicalScore - a.technicalScore)
      .slice(0, 7);

    const tickers = candidates.map((c) => c.ticker);
    const news = await getNews(tickers);
    candidates = candidates.map((c) => ({
      ...c,
      news: news.filter((n) => n.tickers?.some((t) => t.toUpperCase() === c.ticker.toUpperCase())).slice(0, 6),
      // Shares/float enrichment now loads after the core scan returns, so these
      // slow external calls never block market-scan results.
      outstandingShares: null,
      outstandingSharesAsOf: null,
      freeFloatShares: null,
      freeFloatPercent: null,
      freeFloatAsOf: null,
      floatMarketCap: null
    }));

    // v0.2: one primary-source web-research pass across the top finalists.
    candidates = await verifyCatalysts(candidates);
    candidates = await analyzeCandidates(candidates);

    const strong = candidates.filter((c) =>
      c.ai?.rating === "Strong" &&
      c.technicalScore >= 70 &&
      c.research?.status === "Confirmed" &&
      (c.research?.dilutionFlags.length || 0) === 0
    );
    const status = strong.length ? "OPPORTUNITIES_FOUND" : "NO_TRADE";

    return NextResponse.json({
      status,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      dataLabel: "Tiingo consolidated derived realtime + consolidated intraday bars",
      researchLabel: "OpenAI primary-source web verification (SEC / company IR / FDA / ClinicalTrials.gov)",
      limitations: [
        "Shares outstanding are sourced from SEC XBRL. Free float is sourced from ORTEX when available; float market cap is calculated as current price × free-float shares. Float data can lag ownership filings and may be unavailable on the trial feed.",
        "Primary-source catalyst research is limited to the strongest finalists to control cost and latency.",
        "Tiingo Starter data is licensed for personal/internal use; do not redistribute it publicly.",
        "A Strong rating is research output, not an instruction to trade. Confirm prices and filings yourself before acting."
      ],
      stats: {
        snapshots: snapshots.length,
        discoveryPassed: discovered.length,
        deepValidated: validatedRaw.filter((r) => r.status === "fulfilled").length,
        researched: candidates.filter((c) => Boolean(c.research)).length,
        finalists: candidates.length
      },
      candidates
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Scan failed"
    }, { status: 500 });
  }
}
