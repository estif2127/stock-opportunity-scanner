import "server-only";
import OpenAI from "openai";
import type { Candidate } from "./types";

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

const SYSTEM = `You are the final decision layer for a conservative stock opportunity scanner.
Use only the supplied market metrics, news, and primary-source research. Never invent fundamentals, float, short interest, filings, FDA status, dilution, bid/ask data, or live prices.
Fundamentals determine WHAT to own; technicals determine WHEN to own it. This version is still momentum-first.
A strong short-term setup should generally have: verified RVOL >=3x (ideally >=5x), accelerating volume, tight liquidity, high dollar volume, within about 3-5% of HOD, above/holding VWAP, higher lows/consolidation, and a meaningful fresh catalyst.
A catalyst marked Unconfirmed cannot support a Strong rating. Meaningful dilution/capital-structure red flags should sharply reduce the rating even if the technical chart looks good.
For biotech, explicitly respect small sample size and separate clinical promise from shareholder/capital-structure quality.
Do not force trades. If evidence is weak, output Watch or Avoid. Avoid chasing parabolic moves.
Entry triggers must be conditional, not market orders. Invalidation must be logically below structure/VWAP/support when data supports it.
Return JSON only, with no markdown.`;

function candidatePayload(c: Candidate) {
  return {
    ticker: c.ticker,
    currentPrice: c.currentPrice,
    changePct: c.changePct,
    volume: c.volume,
    high: c.high,
    low: c.low,
    prevClose: c.prevClose,
    distanceFromHodPct: c.distanceFromHodPct,
    spreadPct: c.spreadPct,
    dollarVolume: c.dollarVolume,
    vwap: c.vwap,
    rvol: c.rvol,
    rvolVerified: c.rvolVerified,
    volumeAcceleration: c.volumeAcceleration,
    higherLows: c.higherLows,
    aboveVwap: c.aboveVwap,
    technicalScore: c.technicalScore,
    warnings: c.warnings,
    catalystResearch: c.research || null,
    news: c.news.slice(0, 5).map(n => ({
      title: n.title,
      description: n.description?.slice(0, 700),
      source: n.source,
      publishedDate: n.publishedDate
    }))
  };
}

export async function analyzeCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  const ai = client();
  if (!ai || !candidates.length) return candidates;

  const prompt = `${SYSTEM}\n\nAnalyze these candidates:\n${JSON.stringify(candidates.map(candidatePayload))}\n\nReturn exactly this JSON shape:\n{
    "results": [
      {
        "ticker": "XYZ",
        "rating": "Strong|Watch|Avoid",
        "summary": "short setup summary",
        "whyMoving": "best supported reason or Unclear / needs catalyst confirmation",
        "catalyst": "verified catalyst summary, or No verified catalyst",
        "majorRisk": "main risk",
        "capitalStructureRisk": "specific verified dilution risk or Unverified",
        "entryTrigger": "conditional trigger or No actionable entry",
        "invalidation": "price/condition or Needs confirmation",
        "targets": ["target 1", "target 2"],
        "riskReward": "e.g. ~2.1:1 or Not established",
        "confidence": 0
      }
    ]
  }`;

  try {
    const response = await ai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: prompt,
      max_output_tokens: 3500
    });
    let text = response.output_text.trim();
    text = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(text) as { results?: Array<Record<string, unknown>> };
    const map = new Map((parsed.results || []).map((r) => [String(r.ticker || "").toUpperCase(), r]));

    return candidates.map((c) => {
      const r = map.get(c.ticker.toUpperCase());
      if (!r) return c;
      const rating = r.rating === "Strong" || r.rating === "Avoid" ? r.rating : "Watch";
      return {
        ...c,
        ai: {
          rating,
          summary: String(r.summary || "Needs confirmation"),
          whyMoving: String(r.whyMoving || "Unclear"),
          catalyst: String(r.catalyst || "No verified catalyst"),
          majorRisk: String(r.majorRisk || "Unverified risk"),
          capitalStructureRisk: String(r.capitalStructureRisk || "Unverified"),
          entryTrigger: String(r.entryTrigger || "No actionable entry"),
          invalidation: String(r.invalidation || "Needs confirmation"),
          targets: Array.isArray(r.targets) ? r.targets.map(String).slice(0, 3) : [],
          riskReward: String(r.riskReward || "Not established"),
          confidence: Math.max(0, Math.min(100, Number(r.confidence) || 0))
        }
      };
    });
  } catch (error) {
    console.error("OpenAI analysis failed", error);
    return candidates;
  }
}
