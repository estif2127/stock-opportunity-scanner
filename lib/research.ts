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

  // Deep web research is intentionally limited to the strongest few finalists to keep cost/latency controlled.
  const deep = candidates.slice(0, 5);
  const payload = deep.map((c) => ({
    ticker: c.ticker,
    priceChangePct: c.changePct,
    recentNews: c.news.slice(0, 5).map((n) => ({
      title: n.title,
      description: n.description?.slice(0, 600),
      source: n.source,
      publishedDate: n.publishedDate,
      url: n.url
    }))
  }));

  const prompt = `You are the primary-source verification layer for a conservative stock opportunity scanner.
Today is ${new Date().toISOString()}.

For EACH ticker below, investigate why the stock is moving and verify the catalyst using current web information.
Prioritize primary evidence in this order:
1) SEC.gov filings (especially 8-K, 10-Q/10-K, S-3, 424B, EFFECT, offering/ATM/warrant/convertible disclosures)
2) company investor-relations / official press releases
3) FDA.gov for regulatory/approval/status claims
4) ClinicalTrials.gov for trial design, phase, enrollment and status
5) reputable financial reporting only as a supplement.

Rules:
- Do not call a catalyst Confirmed based only on an aggregator headline when a primary source should exist.
- Explicitly flag recent offerings, ATM programs, S-3 shelf registrations, warrants, convertibles, reverse splits, going-concern language or other dilution/capital-structure concerns when found.
- For biotech, separate scientific/clinical evidence from stock/capital-structure risk.
- If patient count is very small, mark smallDatasetWarning=true.
- Do not infer FDA approval or clinical success from company wording alone; verify it.
- Do not invent a source URL. Include only URLs actually found during research.
- If the move has no clear fresh catalyst, say Unconfirmed.

Candidates:
${JSON.stringify(payload)}

Return JSON only using exactly this shape:
{
  "results": [
    {
      "ticker": "XYZ",
      "companyName": "Company Inc.",
      "status": "Confirmed|Partially confirmed|Unconfirmed",
      "catalystType": "Earnings|Contract|FDA|Clinical trial|Analyst action|M&A|Financing|Corporate update|Other|Unclear",
      "summary": "concise verified explanation",
      "sourceQuality": "High|Medium|Low",
      "significanceScore": 0,
      "freshness": "e.g. today / 2 days ago / unclear",
      "primarySources": [
        {"title":"source title","url":"https://...","domain":"sec.gov"}
      ],
      "secFindings": ["recent filing finding"],
      "dilutionFlags": ["specific flag"],
      "warnings": ["important uncertainty"],
      "biotech": {
        "relevant": false,
        "fdaSummary": "Not relevant or verified FDA summary",
        "trials": [
          {"nctId":"NCT...","phase":"PHASE2","enrollment":42,"status":"RECRUITING","summary":"brief design/result context"}
        ],
        "smallDatasetWarning": false
      }
    }
  ]
}`;

  try {
    const response = await ai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: prompt,
      max_output_tokens: 6000
    });

    const parsed = JSON.parse(cleanJson(response.output_text)) as { results?: any[] };
    const citedUrls = actualCitationUrls(response);
    const byTicker = new Map<string, CatalystResearch>();

    for (const raw of parsed.results || []) {
      const ticker = String(raw?.ticker || "").toUpperCase();
      if (!ticker) continue;

      const sources: PrimarySource[] = [];
      for (const s of Array.isArray(raw.primarySources) ? raw.primarySources : []) {
        const url = safeUrl(s?.url);
        if (!url) continue;
        // If the Responses API exposed citation annotations, only keep URLs the web tool actually cited.
        if (citedUrls.size && !citedUrls.has(url)) continue;
        const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(s?.domain || ""); } })();
        sources.push({
          title: String(s?.title || domain || "Primary source"),
          url,
          domain,
          sourceType: sourceType(domain)
        });
      }

      const biotech = raw?.biotech || {};
      byTicker.set(ticker, {
        checkedAt: new Date().toISOString(),
        companyName: String(raw?.companyName || ticker),
        status: raw?.status === "Confirmed" || raw?.status === "Partially confirmed" ? raw.status : "Unconfirmed",
        catalystType: String(raw?.catalystType || "Unclear"),
        summary: String(raw?.summary || "No verified catalyst found."),
        sourceQuality: raw?.sourceQuality === "High" || raw?.sourceQuality === "Medium" ? raw.sourceQuality : "Low",
        significanceScore: Math.max(0, Math.min(100, Number(raw?.significanceScore) || 0)),
        freshness: String(raw?.freshness || "Unclear"),
        primarySources: sources.slice(0, 6),
        secFindings: (Array.isArray(raw?.secFindings) ? raw.secFindings : []).map(String).slice(0, 6),
        dilutionFlags: (Array.isArray(raw?.dilutionFlags) ? raw.dilutionFlags : []).map(String).slice(0, 6),
        warnings: (Array.isArray(raw?.warnings) ? raw.warnings : []).map(String).slice(0, 6),
        biotech: {
          relevant: Boolean(biotech?.relevant),
          fdaSummary: String(biotech?.fdaSummary || "Not relevant / not verified"),
          trials: (Array.isArray(biotech?.trials) ? biotech.trials : []).map((t: any) => ({
            nctId: t?.nctId ? String(t.nctId) : undefined,
            phase: t?.phase ? String(t.phase) : undefined,
            enrollment: Number.isFinite(Number(t?.enrollment)) ? Number(t.enrollment) : null,
            status: t?.status ? String(t.status) : undefined,
            summary: t?.summary ? String(t.summary) : undefined
          })).slice(0, 4),
          smallDatasetWarning: Boolean(biotech?.smallDatasetWarning)
        }
      });
    }

    return candidates.map((c) => ({ ...c, research: byTicker.get(c.ticker.toUpperCase()) || c.research }));
  } catch (error) {
    console.error("Catalyst web verification failed", error);
    return candidates;
  }
}
