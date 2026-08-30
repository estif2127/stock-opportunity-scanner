import "server-only";
import OpenAI from "openai";
import type { Candidate, ResearchSource, SingleStockReport } from "./types";

const FACT_PASS_TIMEOUT_MS = 28_000;
const SYNTHESIS_TIMEOUT_MS = 18_000;

function client(timeout: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey, timeout, maxRetries: 0 });
}

function cleanJson(text: string) {
  return text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

function actualCitationUrls(response: any): Set<string> {
  const urls = new Set<string>();
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item?.content || []) {
      for (const annotation of part?.annotations || []) {
        const citation = annotation?.url_citation || annotation;
        if (citation?.url) urls.add(String(citation.url));
      }
    }
  }
  return urls;
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch { return null; }
}

function category(domain: string): ResearchSource["category"] {
  const d = domain.toLowerCase();
  if (d.includes("sec.gov")) return "SEC";
  if (d.includes("fda.gov")) return "FDA";
  if (d.includes("clinicaltrials.gov")) return "ClinicalTrials";
  if (d.includes("investor") || d.startsWith("ir.")) return "Company";
  if (d.includes("reuters") || d.includes("bloomberg") || d.includes("wsj") || d.includes("cnbc") || d.includes("finance.yahoo")) return "News";
  return "Other";
}

function parseSources(raw: any, response: any): ResearchSource[] {
  const citations = actualCitationUrls(response);
  const out: ResearchSource[] = [];
  for (const s of Array.isArray(raw?.sources) ? raw.sources : []) {
    const url = safeUrl(s?.url);
    if (!url) continue;
    if (citations.size && !citations.has(url)) continue;
    let domain = String(s?.domain || "");
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    out.push({ title: String(s?.title || domain || "Source"), url, domain, category: category(domain) });
  }
  return out;
}

function baseReport(candidate: Candidate): Omit<SingleStockReport, "verdict" | "confidence" | "thesis" | "whyMoving" | "catalyst" | "fundamentals" | "priceVsBusinessDamage" | "capitalStructure" | "biotech" | "bullCase" | "bearCase" | "upcomingCatalysts" | "whatChangesThesis" | "preferredEntry" | "invalidation" | "targets" | "riskReward" | "sources"> {
  return {
    ticker: candidate.ticker,
    companyName: candidate.ticker,
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
    news: candidate.news.slice(0, 6)
  };
}

export function fallbackReport(candidate: Candidate, reason: string): SingleStockReport {
  return {
    ...baseReport(candidate),
    verdict: "Watch",
    confidence: 35,
    thesis: `Research time budget was reached before enough primary-source facts were verified. ${reason}`,
    whyMoving: candidate.news[0]?.title || "No fresh catalyst was verified inside the research time budget.",
    catalyst: { type: "Unclear", status: "Unconfirmed", freshness: "Unclear", qualityScore: 0, summary: "Needs primary-source confirmation." },
    fundamentals: { revenue: "Not fully verified", earnings: "Not fully verified", margins: "Not fully verified", freeCashFlow: "Not fully verified", cashAndDebt: "Not fully verified", valuation: "Not fully verified", guidance: "Not fully verified", competitivePosition: "Not fully verified" },
    priceVsBusinessDamage: { conclusion: "Not enough verified evidence", priceDamage: "Not established", businessDamage: "Not established", assessment: "Not applicable" },
    capitalStructure: { risk: "Unknown", summary: "Not fully verified inside the time budget", flags: [] },
    biotech: { relevant: false, scientificQuality: "Not verified", capitalQuality: "Not verified", trialContext: "Not verified", fdaStatus: "Not verified", cashRunway: "Not verified", warnings: [] },
    bullCase: [], bearCase: [], upcomingCatalysts: [], whatChangesThesis: [],
    preferredEntry: "No actionable entry established from incomplete research",
    invalidation: "Not established",
    targets: [], riskReward: "Not established", sources: []
  };
}

type FactPacket = {
  companyName?: string;
  facts?: Record<string, unknown>;
  sources: ResearchSource[];
};

async function webFactPass(prompt: string): Promise<FactPacket> {
  const ai = client(FACT_PASS_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FACT_PASS_TIMEOUT_MS - 1000);
  try {
    const response: any = await ai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: prompt,
      max_output_tokens: 1200
    }, { signal: controller.signal });
    let raw: any = {};
    try { raw = JSON.parse(cleanJson(response.output_text)); } catch {}
    return { companyName: raw?.companyName, facts: raw?.facts || raw || {}, sources: parseSources(raw, response) };
  } finally {
    clearTimeout(timer);
  }
}

function compactMarketPayload(candidate: Candidate) {
  return {
    ticker: candidate.ticker,
    price: candidate.currentPrice,
    changePct: candidate.changePct,
    prevClose: candidate.prevClose,
    high: candidate.high,
    low: candidate.low,
    volume: candidate.volume,
    technicalScore: candidate.technicalScore,
    vwap: candidate.vwap,
    rvol: candidate.rvolVerified ? candidate.rvol : null,
    rvolVerified: candidate.rvolVerified,
    distanceFromHodPct: candidate.distanceFromHodPct,
    spreadPct: candidate.spreadPct,
    volumeAcceleration: candidate.volumeAcceleration,
    higherLows: candidate.higherLows,
    aboveVwap: candidate.aboveVwap,
    technicalReasons: candidate.technicalReasons.slice(0, 5),
    technicalWarnings: candidate.warnings.slice(0, 5),
    recentNews: candidate.news.slice(0, 4).map((n) => ({
      title: n.title,
      description: n.description?.slice(0, 240),
      source: n.source,
      publishedDate: n.publishedDate,
      url: n.url
    }))
  };
}

function partialFromFacts(candidate: Candidate, business: FactPacket | null, catalyst: FactPacket | null, reason: string): SingleStockReport {
  const b: any = business?.facts || {};
  const c: any = catalyst?.facts || {};
  const sources = [...(business?.sources || []), ...(catalyst?.sources || [])].filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i).slice(0, 6);
  return {
    ...baseReport(candidate),
    companyName: String(business?.companyName || catalyst?.companyName || candidate.ticker),
    verdict: "Watch",
    confidence: 55,
    thesis: `Structured fact collection completed, but final synthesis did not finish. ${reason}`,
    whyMoving: String(c.whyMoving || candidate.news[0]?.title || "No fresh catalyst fully verified."),
    catalyst: {
      type: String(c.catalystType || "Unclear"),
      status: c.catalystStatus === "Confirmed" || c.catalystStatus === "Partially confirmed" ? c.catalystStatus : "Unconfirmed",
      freshness: String(c.freshness || "Unclear"),
      qualityScore: Number(c.catalystQualityScore) || 0,
      summary: String(c.catalystSummary || "Catalyst verification incomplete.")
    },
    fundamentals: {
      revenue: String(b.revenue || "Not verified"), earnings: String(b.earnings || "Not verified"),
      margins: String(b.margins || "Not verified"), freeCashFlow: String(b.freeCashFlow || "Not verified"),
      cashAndDebt: String(b.cashAndDebt || "Not verified"), valuation: String(b.valuation || "Not verified"),
      guidance: String(b.guidance || "Not verified"), competitivePosition: String(b.competitivePosition || "Not verified")
    },
    priceVsBusinessDamage: { conclusion: "Synthesis incomplete", priceDamage: `Current session: ${candidate.changePct.toFixed(2)}%`, businessDamage: "See verified business facts above", assessment: "Not applicable" },
    capitalStructure: {
      risk: ["Low", "Medium", "High"].includes(String(c.capitalRisk)) ? c.capitalRisk : "Unknown",
      summary: String(c.capitalSummary || "Not fully verified"), flags: Array.isArray(c.capitalFlags) ? c.capitalFlags.map(String).slice(0, 6) : []
    },
    biotech: { relevant: Boolean(c.biotechRelevant), scientificQuality: String(c.scientificQuality || "Not applicable"), capitalQuality: String(c.biotechCapitalQuality || "Not applicable"), trialContext: String(c.trialContext || "Not applicable"), fdaStatus: String(c.fdaStatus || "Not applicable"), cashRunway: String(c.cashRunway || "Not applicable"), warnings: Array.isArray(c.biotechWarnings) ? c.biotechWarnings.map(String).slice(0, 6) : [] },
    bullCase: [], bearCase: [], upcomingCatalysts: Array.isArray(c.upcomingCatalysts) ? c.upcomingCatalysts.map(String).slice(0, 4) : [], whatChangesThesis: [],
    preferredEntry: "Use the technical snapshot; final research synthesis did not complete.", invalidation: "Not established", targets: [], riskReward: "Not established", sources
  };
}

export async function deepResearchStock(candidate: Candidate): Promise<SingleStockReport> {
  const market = compactMarketPayload(candidate);
  const now = new Date().toISOString();

  // Stage 1: two narrow web-research passes in parallel. Each is asked for facts, not a thesis.
  const businessPrompt = `Research ${candidate.ticker} as of ${now}. You are ONLY collecting the latest verified business facts. Prefer the company's latest earnings release / investor relations page and latest 10-Q or 10-K. Do not browse broadly.
Return compact JSON only:
{"companyName":"","facts":{"revenue":"latest revenue and YoY growth with period","earnings":"latest profitability/EPS/operating income context","margins":"latest gross/operating margin facts","freeCashFlow":"latest FCF or operating cash flow fact","cashAndDebt":"latest cash and debt fact","valuation":"brief valuation context only if quickly verifiable","guidance":"latest management guidance","competitivePosition":"1-2 factual sentences on competitive position"},"sources":[{"title":"","url":"https://...","domain":""}]}
Use 2-3 primary/high-quality sources max. If a field is unavailable quickly, say Not verified. No investment opinion.`;

  const catalystPrompt = `Research ${candidate.ticker} as of ${now}. You are ONLY collecting decision-critical catalyst and capital-structure facts. Tiingo context: ${JSON.stringify(market)}.
Prioritize: (1) freshest material reason the stock is moving, verified by company IR/SEC when possible; (2) latest relevant 8-K/S-3/424B/ATM/warrant/convertible/reverse-split/going-concern evidence; (3) upcoming material catalyst. If biotech, also check FDA/ClinicalTrials only as needed.
Return compact JSON only:
{"companyName":"","facts":{"whyMoving":"","catalystType":"","catalystStatus":"Confirmed|Partially confirmed|Unconfirmed","freshness":"","catalystQualityScore":0,"catalystSummary":"","capitalRisk":"Low|Medium|High|Unknown","capitalSummary":"","capitalFlags":[],"upcomingCatalysts":[],"biotechRelevant":false,"scientificQuality":"","biotechCapitalQuality":"","trialContext":"","fdaStatus":"","cashRunway":"","biotechWarnings":[]},"sources":[{"title":"","url":"https://...","domain":""}]}
Use 2-3 high-quality sources max. Do not search years of filings.`;

  const [businessResult, catalystResult] = await Promise.allSettled([
    webFactPass(businessPrompt),
    webFactPass(catalystPrompt)
  ]);
  const business = businessResult.status === "fulfilled" ? businessResult.value : null;
  const catalyst = catalystResult.status === "fulfilled" ? catalystResult.value : null;

  if (!business && !catalyst) {
    return fallbackReport(candidate, "Both structured fact passes timed out or failed.");
  }

  // Stage 2: fast synthesis with NO web search. It reasons only over already-collected facts.
  const synthesisAi = client(SYNTHESIS_TIMEOUT_MS);
  const synthesisController = new AbortController();
  const synthesisTimer = setTimeout(() => synthesisController.abort(), SYNTHESIS_TIMEOUT_MS - 1000);
  try {
    const synthPrompt = `You are synthesizing a one-stock research report. Do NOT browse the web. Use only the verified fact packets and Tiingo technical data below. If evidence is missing, say so rather than inventing it.

MARKET/TECHNICAL DATA:\n${JSON.stringify(market)}
BUSINESS FACTS:\n${JSON.stringify(business?.facts || {})}
CATALYST/CAPITAL FACTS:\n${JSON.stringify(catalyst?.facts || {})}

Return compact JSON only:
{
  "companyName":"",
  "verdict":"Strong|Watch|Avoid",
  "confidence":0,
  "thesis":"2-4 concise sentences",
  "whyMoving":"",
  "catalyst":{"type":"","status":"Confirmed|Partially confirmed|Unconfirmed","freshness":"","qualityScore":0,"summary":""},
  "fundamentals":{"revenue":"","earnings":"","margins":"","freeCashFlow":"","cashAndDebt":"","valuation":"","guidance":"","competitivePosition":""},
  "priceVsBusinessDamage":{"conclusion":"","priceDamage":"","businessDamage":"","assessment":"Price damage worse|Roughly aligned|Business damage worse|Not applicable"},
  "capitalStructure":{"risk":"Low|Medium|High|Unknown","summary":"","flags":[]},
  "biotech":{"relevant":false,"scientificQuality":"","capitalQuality":"","trialContext":"","fdaStatus":"","cashRunway":"","warnings":[]},
  "bullCase":[],"bearCase":[],"upcomingCatalysts":[],"whatChangesThesis":[],
  "preferredEntry":"","invalidation":"","targets":[],"riskReward":""
}
Rules: Strong must be rare and requires a confirmed material catalyst, acceptable capital structure, and supportive technical/fundamental evidence. Never fabricate live values. If current market is closed or technical data is stale, make entry language conditional.`;

    const response: any = await synthesisAi.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: synthPrompt,
      max_output_tokens: 1900
    }, { signal: synthesisController.signal });

    let raw: any;
    try { raw = JSON.parse(cleanJson(response.output_text)); }
    catch { return partialFromFacts(candidate, business, catalyst, "The final synthesis response was malformed."); }

    const fundamentals = raw?.fundamentals || {};
    const damage = raw?.priceVsBusinessDamage || {};
    const capital = raw?.capitalStructure || {};
    const biotech = raw?.biotech || {};
    const cat = raw?.catalyst || {};
    const sources = [...(business?.sources || []), ...(catalyst?.sources || [])].filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i).slice(0, 6);

    return {
      ...baseReport(candidate),
      companyName: String(raw?.companyName || business?.companyName || catalyst?.companyName || candidate.ticker),
      verdict: raw?.verdict === "Strong" || raw?.verdict === "Avoid" ? raw.verdict : "Watch",
      confidence: Math.max(0, Math.min(100, Number(raw?.confidence) || 0)),
      thesis: String(raw?.thesis || "Insufficient evidence for a high-conviction thesis."),
      whyMoving: String(raw?.whyMoving || catalyst?.facts?.whyMoving || "No clearly verified fresh catalyst."),
      catalyst: {
        type: String(cat?.type || "Unclear"),
        status: cat?.status === "Confirmed" || cat?.status === "Partially confirmed" ? cat.status : "Unconfirmed",
        freshness: String(cat?.freshness || "Unclear"),
        qualityScore: Math.max(0, Math.min(100, Number(cat?.qualityScore) || 0)),
        summary: String(cat?.summary || "No clearly verified fresh catalyst.")
      },
      fundamentals: {
        revenue: String(fundamentals?.revenue || "Not verified"), earnings: String(fundamentals?.earnings || "Not verified"),
        margins: String(fundamentals?.margins || "Not verified"), freeCashFlow: String(fundamentals?.freeCashFlow || "Not verified"),
        cashAndDebt: String(fundamentals?.cashAndDebt || "Not verified"), valuation: String(fundamentals?.valuation || "Not verified"),
        guidance: String(fundamentals?.guidance || "Not verified"), competitivePosition: String(fundamentals?.competitivePosition || "Not verified")
      },
      priceVsBusinessDamage: {
        conclusion: String(damage?.conclusion || "Not enough evidence"), priceDamage: String(damage?.priceDamage || "Not established"),
        businessDamage: String(damage?.businessDamage || "Not established"),
        assessment: ["Price damage worse", "Roughly aligned", "Business damage worse", "Not applicable"].includes(damage?.assessment) ? damage.assessment : "Not applicable"
      },
      capitalStructure: {
        risk: ["Low", "Medium", "High", "Unknown"].includes(capital?.risk) ? capital.risk : "Unknown",
        summary: String(capital?.summary || "Not fully verified"), flags: (Array.isArray(capital?.flags) ? capital.flags : []).map(String).slice(0, 6)
      },
      biotech: {
        relevant: Boolean(biotech?.relevant), scientificQuality: String(biotech?.scientificQuality || "Not applicable"),
        capitalQuality: String(biotech?.capitalQuality || "Not applicable"), trialContext: String(biotech?.trialContext || "Not applicable"),
        fdaStatus: String(biotech?.fdaStatus || "Not applicable"), cashRunway: String(biotech?.cashRunway || "Not applicable"),
        warnings: (Array.isArray(biotech?.warnings) ? biotech.warnings : []).map(String).slice(0, 6)
      },
      bullCase: (Array.isArray(raw?.bullCase) ? raw.bullCase : []).map(String).slice(0, 5),
      bearCase: (Array.isArray(raw?.bearCase) ? raw.bearCase : []).map(String).slice(0, 5),
      upcomingCatalysts: (Array.isArray(raw?.upcomingCatalysts) ? raw.upcomingCatalysts : []).map(String).slice(0, 5),
      whatChangesThesis: (Array.isArray(raw?.whatChangesThesis) ? raw.whatChangesThesis : []).map(String).slice(0, 5),
      preferredEntry: String(raw?.preferredEntry || "No actionable entry established"), invalidation: String(raw?.invalidation || "Not established"),
      targets: (Array.isArray(raw?.targets) ? raw.targets : []).map(String).slice(0, 4), riskReward: String(raw?.riskReward || "Not established"),
      sources
    };
  } catch (error: any) {
    return partialFromFacts(candidate, business, catalyst, error?.name === "AbortError" ? "Final synthesis reached its time limit." : "Final synthesis failed.");
  } finally {
    clearTimeout(synthesisTimer);
  }
}
