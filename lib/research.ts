import "server-only";
import OpenAI from "openai";
import type { Candidate, CatalystResearch, PrimarySource } from "./types";

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
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

function sourceType(domain: string): PrimarySource["sourceType"] {
  const d = domain.toLowerCase();
  if (d.includes("sec.gov")) return "SEC";
  if (d.includes("fda.gov")) return "FDA";
  if (d.includes("clinicaltrials.gov")) return "ClinicalTrials";
  if (d.includes("investor") || d.includes("ir.")) return "Company";
  return "Other";
}

function safeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function verifyCatalysts(candidates: Candidate[]): Promise<Candidate[]> {
  const ai = client();
  if (!ai || !candidates.length) return candidates;
  const openai = ai;

  // Keep catalyst verification useful without creating a large TPM burst.
  // Research only the two strongest finalists and do them SEQUENTIALLY.
  const deep = candidates.slice(0, 2);
  const byTicker = new Map<string, CatalystResearch>();

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function retryDelayMs(error: any, attempt: number) {
    const headers = error?.headers;
    const retryAfterMs = Number(headers?.get?.("retry-after-ms"));
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return Math.min(15_000, retryAfterMs + 500);
    const retryAfterSec = Number(headers?.get?.("retry-after"));
    if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) return Math.min(15_000, retryAfterSec * 1000 + 500);
    return Math.min(10_000, 2500 * (attempt + 1));
  }

  async function researchOne(c: Candidate): Promise<CatalystResearch | null> {
    const payload = {
      ticker: c.ticker,
      priceChangePct: c.changePct,
      recentNews: c.news.slice(0, 3).map((n) => ({
        title: n.title,
        description: n.description?.slice(0, 350),
        source: n.source,
        publishedDate: n.publishedDate,
        url: n.url
      }))
    };

    const prompt = `You verify the fresh catalyst for ONE stock in a conservative momentum scanner.
Today is ${new Date().toISOString()}.

Ticker/candidate:
${JSON.stringify(payload)}

Research narrowly. Determine why this stock is moving now and verify the most important fresh catalyst.
Prefer, in order: SEC.gov, company investor relations/official release, FDA.gov, ClinicalTrials.gov, then reputable financial reporting.

Also check ONLY for high-impact capital-structure warnings that could change the trade thesis: recent offering, ATM, S-3/424B, warrants, converts, reverse split, going-concern language.
For biotech, verify FDA/trial claims and flag very small datasets.
Do not invent URLs or facts. If no primary-source confirmation is found quickly, mark it Unconfirmed.

Return JSON only:
{
  "ticker": "XYZ",
  "companyName": "Company Inc.",
  "status": "Confirmed|Partially confirmed|Unconfirmed",
  "catalystType": "Earnings|Contract|FDA|Clinical trial|Analyst action|M&A|Financing|Corporate update|Other|Unclear",
  "summary": "concise verified explanation",
  "sourceQuality": "High|Medium|Low",
  "significanceScore": 0,
  "freshness": "today / N days ago / unclear",
  "primarySources": [{"title":"source title","url":"https://...","domain":"sec.gov"}],
  "secFindings": ["finding"],
  "dilutionFlags": ["specific flag"],
  "warnings": ["uncertainty"],
  "biotech": {
    "relevant": false,
    "fdaSummary": "summary",
    "trials": [{"nctId":"NCT...","phase":"PHASE2","enrollment":42,"status":"RECRUITING","summary":"context"}],
    "smallDatasetWarning": false
  }
}`;

    let lastError: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
          tools: [{ type: "web_search", search_context_size: "low" }],
          input: prompt,
          max_output_tokens: 1800
        });

        const raw = JSON.parse(cleanJson(response.output_text)) as any;
        const citedUrls = actualCitationUrls(response);
        const sources: PrimarySource[] = [];

        for (const s of Array.isArray(raw?.primarySources) ? raw.primarySources : []) {
          const url = safeUrl(s?.url);
          if (!url) continue;
          if (citedUrls.size && !citedUrls.has(url)) continue;
          const domain = (() => {
            try { return new URL(url).hostname.replace(/^www\./, ""); }
            catch { return String(s?.domain || ""); }
          })();
          sources.push({
            title: String(s?.title || domain || "Primary source"),
            url,
            domain,
            sourceType: sourceType(domain)
          });
        }

        const biotech = raw?.biotech || {};
        return {
          checkedAt: new Date().toISOString(),
          companyName: String(raw?.companyName || c.ticker),
          status: raw?.status === "Confirmed" || raw?.status === "Partially confirmed" ? raw.status : "Unconfirmed",
          catalystType: String(raw?.catalystType || "Unclear"),
          summary: String(raw?.summary || "No verified catalyst found."),
          sourceQuality: raw?.sourceQuality === "High" || raw?.sourceQuality === "Medium" ? raw.sourceQuality : "Low",
          significanceScore: Math.max(0, Math.min(100, Number(raw?.significanceScore) || 0)),
          freshness: String(raw?.freshness || "Unclear"),
          primarySources: sources.slice(0, 4),
          secFindings: (Array.isArray(raw?.secFindings) ? raw.secFindings : []).map(String).slice(0, 4),
          dilutionFlags: (Array.isArray(raw?.dilutionFlags) ? raw.dilutionFlags : []).map(String).slice(0, 4),
          warnings: (Array.isArray(raw?.warnings) ? raw.warnings : []).map(String).slice(0, 4),
          biotech: {
            relevant: Boolean(biotech?.relevant),
            fdaSummary: String(biotech?.fdaSummary || "Not relevant / not verified"),
            trials: (Array.isArray(biotech?.trials) ? biotech.trials : []).map((t: any) => ({
              nctId: t?.nctId ? String(t.nctId) : undefined,
              phase: t?.phase ? String(t.phase) : undefined,
              enrollment: Number.isFinite(Number(t?.enrollment)) ? Number(t.enrollment) : null,
              status: t?.status ? String(t.status) : undefined,
              summary: t?.summary ? String(t.summary) : undefined
            })).slice(0, 3),
            smallDatasetWarning: Boolean(biotech?.smallDatasetWarning)
          }
        };
      } catch (error: any) {
        lastError = error;
        if (error?.status !== 429 || attempt === 1) break;
        await sleep(retryDelayMs(error, attempt));
      }
    }

    console.error(`Catalyst verification failed for ${c.ticker}`, lastError);
    return null;
  }

  for (let i = 0; i < deep.length; i++) {
    const c = deep[i];
    const result = await researchOne(c);
    if (result) byTicker.set(c.ticker.toUpperCase(), result);
    // Avoid back-to-back token bursts even when the first request succeeds.
    if (i < deep.length - 1) await sleep(1200);
  }

  return candidates.map((c) => ({
    ...c,
    research: byTicker.get(c.ticker.toUpperCase()) || c.research
  }));
}
