"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Candidate } from "@/lib/types";

const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

type ScanResult = {
  status: "OPPORTUNITIES_FOUND" | "NO_TRADE";
  generatedAt: string;
  elapsedMs: number;
  dataLabel: string;
  researchLabel?: string;
  limitations: string[];
  stats: { snapshots: number; discoveryPassed: number; deepValidated: number; researched?: number; finalists: number };
  candidates: Candidate[];
};

const money = (v: number | null | undefined) => v == null ? "—" : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined, digits = 1) => v == null ? "—" : `${v.toFixed(digits)}%`;
const compact = (v: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function ratingClass(r?: string) {
  if (r === "Strong") return "strong";
  if (r === "Avoid") return "avoid";
  return "watch";
}

function catalystClass(status?: string) {
  if (status === "Confirmed") return "confirmed";
  if (status === "Partially confirmed") return "partial";
  return "unconfirmed";
}

export default function Home() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  async function scan() {
    setLoading(true); setError(""); setResult(null); setOpenTicker(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally { setLoading(false); }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="pulse" /> OPPORTUNITY SCANNER</div>
        <div className="data-pill">TIINGO · PRIMARY-SOURCE RESEARCH</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">MOMENTUM + CATALYST ENGINE · V0.2</p>
          <h1>Find setups worth<br/><span>paying attention to.</span></h1>
          <p className="sub">Market discovery, intraday validation, then primary-source catalyst research. SEC, company releases, FDA and ClinicalTrials evidence can now affect the final rating.</p>
        </div>
        <button className="scanButton" onClick={scan} disabled={loading}>
          {loading ? <><span className="spinner"/> RESEARCHING MARKET</> : <>SCAN MARKET <span>↗</span></>}
        </button>
      </section>

      <section className="rules">
        <span>$1–$50</span><span>+5%+</span><span>1M+ VOL</span><span>RVOL</span><span>VWAP</span><span>HOD</span><span>SEC</span><span>FDA</span><span>TRIALS</span><span>DILUTION</span>
      </section>

      {loading && <section className="loadingPanel"><div className="scannerLine"/><p>Filtering the market → validating intraday bars → checking news → verifying primary sources → ranking finalists…</p></section>}
      {error && <section className="error"><strong>Scan failed:</strong> {error}<br/><small>Check TIINGO_API_KEY and OPENAI_API_KEY in Vercel environment variables.</small></section>}

      {result && (
        <>
          <section className={`verdict ${result.status === "NO_TRADE" ? "noTrade" : "hasTrades"}`}>
            <div>
              <p className="eyebrow">SCAN VERDICT</p>
              <h2>{result.status === "NO_TRADE" ? "NO TRADE" : "OPPORTUNITIES FOUND"}</h2>
              <p>{result.status === "NO_TRADE" ? "No finalist cleared technical quality + confirmed catalyst + capital-risk standards. Standards were not lowered." : "At least one finalist cleared the current technical and catalyst thresholds. Broker confirmation is still required."}</p>
            </div>
            <div className="stats">
              <div><b>{compact(result.stats.snapshots)}</b><span>snapshots</span></div>
              <div><b>{result.stats.discoveryPassed}</b><span>discovery</span></div>
              <div><b>{result.stats.deepValidated}</b><span>validated</span></div>
              <div><b>{result.stats.researched ?? 0}</b><span>researched</span></div>
              <div><b>{(result.elapsedMs/1000).toFixed(1)}s</b><span>scan time</span></div>
            </div>
          </section>

          <section className="resultsHeader"><h2>Ranked finalists</h2><p>{new Date(result.generatedAt).toLocaleString()}</p></section>

          <section className="cards">
            {result.candidates.map((c, i) => (
              <article className="card" key={c.ticker}>
                <div className="cardTop">
                  <div className="rank">#{i+1}</div>
                  <div className="tickerBlock"><h3>{c.ticker}</h3><span>{money(c.currentPrice)}</span></div>
                  <div className="move">+{pct(c.changePct)}</div>
                  <div className={`rating ${ratingClass(c.ai?.rating)}`}>{c.ai?.rating || "Watch"}</div>
                </div>

                <div className="scoreRow">
                  <div><span>TECHNICAL</span><b>{c.technicalScore}/100</b></div>
                  <div><span>CATALYST</span><b>{c.research ? `${c.research.significanceScore}/100` : "VERIFY"}</b></div>
                  <div><span>RVOL</span><b>{c.rvolVerified && c.rvol ? `${c.rvol.toFixed(1)}x` : "VERIFY"}</b></div>
                  <div><span>FROM HOD</span><b>-{pct(c.distanceFromHodPct)}</b></div>
                  <div><span>VWAP</span><b className={c.aboveVwap ? "goodText" : "badText"}>{c.aboveVwap == null ? "—" : c.aboveVwap ? "ABOVE" : "BELOW"}</b></div>
                  <div><span>VOLUME</span><b>{compact(c.volume)}</b></div>
                </div>

                {c.research && (
                  <section className="catalystPanel">
                    <div className="catalystTop">
                      <div>
                        <span className="miniLabel">PRIMARY-SOURCE CATALYST</span>
                        <h4>{c.research.catalystType}</h4>
                      </div>
                      <div className={`catalystBadge ${catalystClass(c.research.status)}`}>{c.research.status}</div>
                    </div>
                    <p>{c.research.summary}</p>
                    <div className="researchMeta">
                      <span>Source quality <b>{c.research.sourceQuality}</b></span>
                      <span>Freshness <b>{c.research.freshness}</b></span>
                      <span>Company <b>{c.research.companyName}</b></span>
                    </div>

                    {c.research.dilutionFlags.length > 0 && (
                      <div className="riskBox"><b>⚠ CAPITAL / DILUTION FLAGS</b>{c.research.dilutionFlags.map((x, idx) => <p key={idx}>• {x}</p>)}</div>
                    )}

                    {c.research.secFindings.length > 0 && (
                      <div className="evidenceBox"><b>SEC FINDINGS</b>{c.research.secFindings.map((x, idx) => <p key={idx}>• {x}</p>)}</div>
                    )}

                    {c.research.biotech.relevant && (
                      <div className="biotechBox">
                        <b>🧬 BIOTECH VERIFICATION</b>
                        <p>{c.research.biotech.fdaSummary}</p>
                        {c.research.biotech.smallDatasetWarning && <p className="warningText">⚠ Small patient dataset — do not treat as equivalent to a large randomized trial.</p>}
                        {c.research.biotech.trials.map((t, idx) => <p key={idx}>• {t.nctId || "Trial"} · {t.phase || "phase unknown"} · n={t.enrollment ?? "?"} · {t.status || "status unknown"}{t.summary ? ` — ${t.summary}` : ""}</p>)}
                      </div>
                    )}

                    {c.research.primarySources.length > 0 && (
                      <div className="primarySources">
                        {c.research.primarySources.map((s, idx) => <a key={idx} href={s.url} target="_blank" rel="noreferrer"><span>{s.sourceType}</span><b>{s.title}</b><small>{s.domain}</small></a>)}
                      </div>
                    )}
                  </section>
                )}

                <p className="summary">{c.ai?.summary || c.technicalReasons.join(" · ") || "Needs confirmation"}</p>

                <div className="analysisGrid">
                  <div><label>WHY IT'S MOVING</label><p>{c.ai?.whyMoving || "Needs catalyst confirmation"}</p></div>
                  <div><label>CATALYST</label><p>{c.ai?.catalyst || "No verified catalyst"}</p></div>
                  <div><label>CAPITAL STRUCTURE</label><p>{c.ai?.capitalStructureRisk || "Unverified"}</p></div>
                  <div><label>ENTRY TRIGGER</label><p>{c.ai?.entryTrigger || "No actionable entry"}</p></div>
                  <div><label>INVALIDATION</label><p>{c.ai?.invalidation || "Needs confirmation"}</p></div>
                  <div><label>RISK / REWARD</label><p>{c.ai?.riskReward || "Not established"}</p></div>
                  <div><label>MAJOR RISK</label><p>{c.ai?.majorRisk || c.warnings.join("; ")}</p></div>
                </div>

                {c.ai?.targets?.length ? <div className="targets"><label>TARGETS</label>{c.ai.targets.map((t, x) => <span key={x}>{t}</span>)}</div> : null}

                <button className="chartToggle" onClick={() => setOpenTicker(openTicker === c.ticker ? null : c.ticker)}>
                  {openTicker === c.ticker ? "HIDE CHART" : "VIEW INTRADAY CHART"} <span>⌁</span>
                </button>
                {openTicker === c.ticker && <StockChart bars={c.bars} />}

                {c.news.length > 0 && <details><summary>Tiingo news discovery sources ({c.news.length})</summary><div className="newsList">{c.news.map((n, x) => <a key={x} href={n.url} target="_blank" rel="noreferrer"><b>{n.title}</b><span>{n.source} · {n.publishedDate ? new Date(n.publishedDate).toLocaleString() : ""}</span></a>)}</div></details>}
              </article>
            ))}
          </section>

          <section className="limitations"><strong>DATA / RISK NOTES</strong>{result.limitations.map((x, i) => <p key={i}>• {x}</p>)}<p>• Market feed: {result.dataLabel}</p>{result.researchLabel && <p>• Research: {result.researchLabel}</p>}</section>
        </>
      )}

      <footer>Research scanner only · Not financial advice · Always confirm executable prices and primary filings yourself.</footer>
    </main>
  );
}
