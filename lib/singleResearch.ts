import "server-only";
import OpenAI from "openai";
import type { Candidate, ResearchSource, SingleStockReport, StructuredFundamentals } from "./types";

const RESEARCH_BUDGET_MS = 55_000;

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey, timeout: 45_000, maxRetries: 0 });
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

export function fallbackReport(candidate: Candidate, reason: string): SingleStockReport {
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
    verdict: "Watch",
    confidence: 35,
    thesis: `Research time budget was reached before primary-source verification finished. ${reason}`,
    whyMoving: candidate.news[0]?.title || "No fresh catalyst was verified inside the research time budget.",
    catalyst: { type: "Unclear", status: "Unconfirmed", freshness: "Unclear", qualityScore: 0, summary: "Needs primary-source confirmation." },
    fundamentals: { revenue: "Not fully verified", earnings: "Not fully verified", margins: "Not fully verified", freeCashFlow: "Not fully verified", cashAndDebt: "Not fully verified", valuation: "Not fully verified", guidance: "Not fully verified", competitivePosition: "Not fully verified" },
    priceVsBusinessDamage: { conclusion: "Not enough verified evidence", priceDamage: "Not established", businessDamage: "Not established", assessment: "Not applicable" },
    capitalStructure: { risk: "Unknown", summary: "Not fully verified inside the time budget", flags: [] },
    biotech: { relevant: false, scientificQuality: "Not verified", capitalQuality: "Not verified", trialContext: "Not verified", fdaStatus: "Not verified", cashRunway: "Not verified", warnings: [] },
    bullCase: [], bearCase: [], upcomingCatalysts: [], whatChangesThesis: [],
    preferredEntry: "No actionable entry established from incomplete research",
    invalidation: "Not established",
    targets: [], riskReward: "Not established", sources: [], news: candidate.news.slice(0, 6)
  };
}


function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function num(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(digits);
}

function structuredFallbacks(f?: StructuredFundamentals) {
  if (!f?.available) return null;
  const revenue = money(f.revenue);
  const growth = num(f.revenueGrowthYoY);
  const netIncome = money(f.netIncome);
  const eps = num(f.epsDiluted, 2);
  const gm = num(f.grossMarginPct);
  const om = num(f.operatingMarginPct);
  const fcf = money(f.freeCashFlow);
  const ocf = money(f.operatingCashFlow);
  const cash = money(f.cash);
  const sti = money(f.shortTermInvestments);
  const debt = money(f.totalDebt);
  const pe = num(f.peRatio, 1);
  const pb = num(f.pbRatio, 1);
  const peg = num(f.trailingPEG1Y, 2);
  return {
    revenue: revenue ? `${revenue}${growth ? `; ${growth}% YoY` : ""}${f.period ? ` (${f.period})` : ""}` : "Not available from structured data",
    earnings: netIncome || eps ? `${netIncome ? `Net income ${netIncome}` : ""}${netIncome && eps ? "; " : ""}${eps ? `diluted EPS ${eps}` : ""}` : "Not available from structured data",
    margins: gm || om ? `${gm ? `Gross margin ${gm}%` : ""}${gm && om ? "; " : ""}${om ? `operating margin ${om}%` : ""}` : "Not available from structured data",
    freeCashFlow: fcf ? `Free cash flow ${fcf}${ocf ? `; operating cash flow ${ocf}` : ""}` : (ocf ? `Operating cash flow ${ocf}; FCF not directly available` : "Not available from structured data"),
    cashAndDebt: cash || debt || sti ? `${cash ? `Cash ${cash}` : ""}${sti ? `${cash ? "; " : ""}short-term investments ${sti}` : ""}${debt ? `${cash || sti ? "; " : ""}total debt ${debt}` : ""}` : "Not available from structured data",
    valuation: pe || pb || peg ? `${pe ? `P/E ${pe}x` : ""}${pb ? `${pe ? "; " : ""}P/B ${pb}x` : ""}${peg ? `${pe || pb ? "; " : ""}PEG ${peg}` : ""}` : "Not available from structured data",
    competitivePosition: [f.sector, f.industry].filter(Boolean).length ? `Sector: ${f.sector || "n/a"}; industry: ${f.industry || "n/a"}. Competitive assessment requires qualitative research.` : "Requires qualitative research"
  };
}

export async function deepResearchStock(candidate: Candidate, structured?: StructuredFundamentals): Promise<SingleStockReport> {
  const ai = client();
  const payload = {
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
    technicalReasons: candidate.technicalReasons.slice(0, 6),
    technicalWarnings: candidate.warnings.slice(0, 6),
    recentNews: candidate.news.slice(0, 5).map((n) => ({
      title: n.title,
      description: n.description?.slice(0, 400),
      source: n.source,
      publishedDate: n.publishedDate,
      url: n.url
    })),
    structuredFundamentals: structured?.available ? structured : { available: false, error: structured?.error || "Not requested" }
  };

  const prompt = `You have a strict ~60 second product time budget. Perform a decision-focused research pass on ONE U.S. stock. Do not be exhaustive. Search only what materially changes the verdict.
Current time: ${new Date().toISOString()}.

Tiingo market inputs:
${JSON.stringify(payload)}

Prioritize, in this order:
1) WHY MOVING: identify the freshest material catalyst and verify it with a primary source when possible (company IR/press release or SEC). Do not chase old/recycled headlines.
2) LATEST BUSINESS SNAPSHOT: IMPORTANT: if structuredFundamentals.available=true in the Tiingo input, treat those normalized statement/valuation values as VERIFIED structured facts and use them directly. Use web/SEC/company IR only to fill missing items such as guidance, qualitative competitive position, or newer post-filing developments. Do not replace verified structured values with "Not provided". If structuredFundamentals is unavailable, fall back to the latest earnings release or 10-Q/10-K.
3) CAPITAL STRUCTURE: check the most recent relevant SEC material for active/recent ATM, S-3/424B offering, warrants, convertibles, reverse split, rapid share-count growth or going-concern risk. Do not search years of filings unless necessary.
4) PRICE DAMAGE VS BUSINESS DAMAGE: state whether market punishment looks worse than underlying deterioration, roughly aligned, or justified by worse business damage.
5) BIOTECH ONLY IF RELEVANT: verify phase, patient count/design, FDA status, next readout and financing risk. Explicitly flag tiny datasets.
6) Give the bull case, bear case, next catalysts, thesis breakers and a conservative verdict.

Research limits:
- Prefer 3-6 high-quality sources total.
- Prefer SEC.gov, official company IR, FDA.gov, ClinicalTrials.gov, then reputable financial reporting.
- Do not read or summarize entire filings; find the sections that answer the questions above.
- Never fabricate live price/HOD/VWAP/RVOL/spread. Use Tiingo inputs only for those.
- Strong should be rare. If evidence is incomplete, use Watch.
- Return compact JSON only, no prose outside JSON.

Return exactly:
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
  "bullCase":[],
  "bearCase":[],
  "upcomingCatalysts":[],
  "whatChangesThesis":[],
  "preferredEntry":"",
  "invalidation":"",
  "targets":[],
  "riskReward":"",
  "sources":[{"title":"","url":"https://...","domain":""}]
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_BUDGET_MS);
  let response: any;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await ai.responses.create({
          model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
          tools: [{ type: "web_search", search_context_size: "low" }],
          input: prompt,
          max_output_tokens: 2800
        }, { signal: controller.signal });
        break;
      } catch (error: any) {
        const isAbort = error?.name === "AbortError" || controller.signal.aborted;
        if (isAbort) return fallbackReport(candidate, "The app returned a partial report instead of making you wait indefinitely.");
        const is429 = error?.status === 429 || String(error?.message || "").toLowerCase().includes("rate limit");
        if (!is429 || attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 4500));
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!response) return fallbackReport(candidate, "No complete AI response was returned inside the research budget.");

  let raw: any;
  try { raw = JSON.parse(cleanJson(response.output_text)); }
  catch { return fallbackReport(candidate, "The research response was incomplete, so the app did not invent missing facts."); }

  const citations = actualCitationUrls(response);
  const sources: ResearchSource[] = [];
  for (const s of Array.isArray(raw?.sources) ? raw.sources : []) {
    const url = safeUrl(s?.url);
    if (!url) continue;
    if (citations.size && !citations.has(url)) continue;
    let domain = String(s?.domain || "");
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    sources.push({ title: String(s?.title || domain || "Source"), url, domain, category: category(domain) });
  }

  const fundamentals = raw?.fundamentals || {};
  const sf = structuredFallbacks(structured);
  const damage = raw?.priceVsBusinessDamage || {};
  const capital = raw?.capitalStructure || {};
  const biotech = raw?.biotech || {};
  const catalyst = raw?.catalyst || {};

  return {
    ticker: candidate.ticker,
    companyName: String(raw?.companyName || structured?.companyName || candidate.ticker),
    generatedAt: new Date().toISOString(),
    currentPrice: candidate.currentPrice,
    changePct: candidate.changePct,
    high: candidate.high,
    low: candidate.low,
    prevClose: candidate.prevClose,
    volume: candidate.volume,
    bars: candidate.bars,
    technical: {
      score: candidate.technicalScore, vwap: candidate.vwap, aboveVwap: candidate.aboveVwap,
      rvol: candidate.rvol, rvolVerified: candidate.rvolVerified, distanceFromHodPct: candidate.distanceFromHodPct,
      spreadPct: candidate.spreadPct, volumeAcceleration: candidate.volumeAcceleration, higherLows: candidate.higherLows,
      reasons: candidate.technicalReasons, warnings: candidate.warnings
    },
    verdict: raw?.verdict === "Strong" || raw?.verdict === "Avoid" ? raw.verdict : "Watch",
    confidence: Math.max(0, Math.min(100, Number(raw?.confidence) || 0)),
    thesis: String(raw?.thesis || "Insufficient evidence for a high-conviction thesis."),
    whyMoving: String(raw?.whyMoving || "No clearly verified fresh catalyst."),
    catalyst: {
      type: String(catalyst?.type || "Unclear"),
      status: catalyst?.status === "Confirmed" || catalyst?.status === "Partially confirmed" ? catalyst.status : "Unconfirmed",
      freshness: String(catalyst?.freshness || "Unclear"),
      qualityScore: Math.max(0, Math.min(100, Number(catalyst?.qualityScore) || 0)),
      summary: String(catalyst?.summary || "No clearly verified fresh catalyst.")
    },
    fundamentals: {
      revenue: String(fundamentals?.revenue || sf?.revenue || "Not verified"),
      earnings: String(fundamentals?.earnings || sf?.earnings || "Not verified"),
      margins: String(fundamentals?.margins || sf?.margins || "Not verified"),
      freeCashFlow: String(fundamentals?.freeCashFlow || sf?.freeCashFlow || "Not verified"),
      cashAndDebt: String(fundamentals?.cashAndDebt || sf?.cashAndDebt || "Not verified"),
      valuation: String(fundamentals?.valuation || sf?.valuation || "Not verified"),
      guidance: String(fundamentals?.guidance || "Not verified"),
      competitivePosition: String(fundamentals?.competitivePosition || sf?.competitivePosition || "Not verified")
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
    preferredEntry: String(raw?.preferredEntry || "No actionable entry established"),
    invalidation: String(raw?.invalidation || "Not established"),
    targets: (Array.isArray(raw?.targets) ? raw.targets : []).map(String).slice(0, 4),
    riskReward: String(raw?.riskReward || "Not established"),
    sources: sources.slice(0, 6),
    news: candidate.news.slice(0, 6)
  };
}
