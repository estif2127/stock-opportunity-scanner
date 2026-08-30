import "server-only";
import OpenAI from "openai";
import type { Candidate, ResearchSource, SingleStockReport } from "./types";

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
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

export async function deepResearchStock(candidate: Candidate): Promise<SingleStockReport> {
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
    technicalReasons: candidate.technicalReasons,
    technicalWarnings: candidate.warnings,
    recentNews: candidate.news.slice(0, 10).map((n) => ({
      title: n.title, description: n.description?.slice(0, 1000), source: n.source,
      publishedDate: n.publishedDate, url: n.url
    }))
  };

  const prompt = `Act as a conservative professional equity-research analyst. Deep-research ONE stock using current web information and primary sources.
Today is ${new Date().toISOString()}.

Ticker and live/intraday inputs from Tiingo:
${JSON.stringify(payload)}

Research priorities:
1. Verify why the stock is moving. Prefer SEC filings, company investor relations and official releases.
2. Review the latest earnings release, 10-Q/10-K and guidance. Describe revenue/growth, earnings, margins, free cash flow, cash, debt, valuation context, guidance and competitive position. Do not invent numbers; when exact current figures are unclear, state the qualitative conclusion instead.
3. Explicitly compare PRICE DAMAGE vs BUSINESS/FUNDAMENTAL DAMAGE. A declining stock is not automatically undervalued.
4. Search recent SEC filings for S-3, 424B, ATM programs, offerings, warrants, convertibles, reverse splits, share-count growth and going-concern language.
5. If biotech/clinical-stage, separately assess clinical/scientific quality vs stock/capital-structure quality. Verify trial phase, enrollment/patient count, design/endpoints, FDA status and important upcoming readouts through FDA/ClinicalTrials/company/SEC sources. Flag small samples.
6. Identify concrete upcoming catalysts and what facts would invalidate the thesis.
7. Use the supplied technical data for timing. Never fabricate live quote, HOD, VWAP, RVOL or spread values.
8. Strong should be rare. Do not force an actionable setup. It is acceptable to rate Watch or Avoid.
9. Do not invent source URLs. Return only URLs actually found with web search.

Return JSON only in this exact shape:
{
  "companyName":"",
  "verdict":"Strong|Watch|Avoid",
  "confidence":0,
  "thesis":"concise overall conclusion",
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

  const response = await ai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    tools: [{ type: "web_search", search_context_size: "medium" }],
    input: prompt,
    max_output_tokens: 8000
  });

  const raw = JSON.parse(cleanJson(response.output_text)) as any;
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
  const damage = raw?.priceVsBusinessDamage || {};
  const capital = raw?.capitalStructure || {};
  const biotech = raw?.biotech || {};
  const catalyst = raw?.catalyst || {};

  return {
    ticker: candidate.ticker,
    companyName: String(raw?.companyName || candidate.ticker),
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
      revenue: String(fundamentals?.revenue || "Not verified"), earnings: String(fundamentals?.earnings || "Not verified"),
      margins: String(fundamentals?.margins || "Not verified"), freeCashFlow: String(fundamentals?.freeCashFlow || "Not verified"),
      cashAndDebt: String(fundamentals?.cashAndDebt || "Not verified"), valuation: String(fundamentals?.valuation || "Not verified"),
      guidance: String(fundamentals?.guidance || "Not verified"), competitivePosition: String(fundamentals?.competitivePosition || "Not verified")
    },
    priceVsBusinessDamage: {
      conclusion: String(damage?.conclusion || "Not enough evidence"),
      priceDamage: String(damage?.priceDamage || "Not established"),
      businessDamage: String(damage?.businessDamage || "Not established"),
      assessment: ["Price damage worse", "Roughly aligned", "Business damage worse", "Not applicable"].includes(damage?.assessment) ? damage.assessment : "Not applicable"
    },
    capitalStructure: {
      risk: ["Low", "Medium", "High", "Unknown"].includes(capital?.risk) ? capital.risk : "Unknown",
      summary: String(capital?.summary || "Not fully verified"),
      flags: (Array.isArray(capital?.flags) ? capital.flags : []).map(String).slice(0, 10)
    },
    biotech: {
      relevant: Boolean(biotech?.relevant), scientificQuality: String(biotech?.scientificQuality || "Not applicable"),
      capitalQuality: String(biotech?.capitalQuality || "Not applicable"), trialContext: String(biotech?.trialContext || "Not applicable"),
      fdaStatus: String(biotech?.fdaStatus || "Not applicable"), cashRunway: String(biotech?.cashRunway || "Not applicable"),
      warnings: (Array.isArray(biotech?.warnings) ? biotech.warnings : []).map(String).slice(0, 10)
    },
    bullCase: (Array.isArray(raw?.bullCase) ? raw.bullCase : []).map(String).slice(0, 8),
    bearCase: (Array.isArray(raw?.bearCase) ? raw.bearCase : []).map(String).slice(0, 8),
    upcomingCatalysts: (Array.isArray(raw?.upcomingCatalysts) ? raw.upcomingCatalysts : []).map(String).slice(0, 8),
    whatChangesThesis: (Array.isArray(raw?.whatChangesThesis) ? raw.whatChangesThesis : []).map(String).slice(0, 8),
    preferredEntry: String(raw?.preferredEntry || "No actionable entry established"),
    invalidation: String(raw?.invalidation || "Not established"),
    targets: (Array.isArray(raw?.targets) ? raw.targets : []).map(String).slice(0, 5),
    riskReward: String(raw?.riskReward || "Not established"),
    sources: sources.slice(0, 12),
    news: candidate.news.slice(0, 10)
  };
}
