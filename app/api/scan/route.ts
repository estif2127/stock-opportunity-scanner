import { NextResponse } from "next/server";
import { analyzeCandidates } from "@/lib/ai";
import { getAllSnapshots, getBars, getNews } from "@/lib/tiingo";
import { buildCandidate, discoveryFilter, rankDiscovery } from "@/lib/technicals";
import type { Candidate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    // Keep request usage modest on Tiingo Starter. Intraday validation costs one request per symbol.
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

    const news = await getNews(candidates.map((c) => c.ticker));
    candidates = candidates.map((c) => ({
      ...c,
      news: news.filter((n) => n.tickers?.some((t) => t.toUpperCase() === c.ticker.toUpperCase())).slice(0, 6)
    }));

    candidates = await analyzeCandidates(candidates);

    const strong = candidates.filter((c) => c.ai?.rating === "Strong" && c.technicalScore >= 70);
    const status = strong.length ? "OPPORTUNITIES_FOUND" : "NO_TRADE";

    return NextResponse.json({
      status,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      dataLabel: "Tiingo consolidated derived realtime + consolidated intraday bars",
      limitations: [
        "Market-cap, float, short interest and full capital-structure checks are not yet verified in this cheap MVP.",
        "Tiingo Starter data is licensed for personal/internal use; do not redistribute it publicly.",
        "A Strong rating is research output, not an instruction to trade. Confirm in your broker before acting."
      ],
      stats: {
        snapshots: snapshots.length,
        discoveryPassed: discovered.length,
        deepValidated: validatedRaw.filter((r) => r.status === "fulfilled").length,
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
