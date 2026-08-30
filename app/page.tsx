"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Candidate, QuickStockSnapshot, SingleStockReport } from "@/lib/types";

const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

type ScanResult = {
  status: "OPPORTUNITIES_FOUND" | "NO_TRADE";
  generatedAt: string;
  elapsedMs: number;
  stats: { snapshots: number; discoveryPassed: number; deepValidated: number; researched?: number; finalists: number };
  candidates: Candidate[];
};

const money = (v: number | null | undefined) => v == null ? "—" : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined, digits = 1) => v == null ? "—" : `${v.toFixed(digits)}%`;
const compact = (v: number | null | undefined) => v == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function verdictClass(v?: string) {
  if (v === "Strong") return "statusGood";
  if (v === "Avoid") return "statusBad";
  return "statusWatch";
}

function safeParse(raw: string, status: number) {
  try { return JSON.parse(raw); }
  catch { throw new Error(raw?.slice(0, 260) || `Server returned HTTP ${status}`); }
}

export default function Home() {
  const [mode, setMode] = useState<"scan" | "research">("scan");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");
  const [openTicker, setOpenTicker] = useState<string | null>(null);

  const [ticker, setTicker] = useState("");
  const [quick, setQuick] = useState<QuickStockSnapshot | null>(null);
  const [report, setReport] = useState<SingleStockReport | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [researchError, setResearchError] = useState("");

  async function scan() {
    setScanLoading(true); setScanError(""); setScanResult(null); setOpenTicker(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = safeParse(await res.text(), res.status);
      if (!res.ok) throw new Error(data.error || `Scan failed (HTTP ${res.status})`);
      setScanResult(data);
    } catch (e) { setScanError(e instanceof Error ? e.message : "Scan failed"); }
    finally { setScanLoading(false); }
  }

  async function researchStock(e?: FormEvent) {
    e?.preventDefault();
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;
    setTicker(clean); setResearchLoading(true); setResearchError(""); setQuick(null); setReport(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: clean, mode: "quick" })
      });
      const data = safeParse(await res.text(), res.status);
      if (!res.ok) throw new Error(data.error || `Snapshot failed (HTTP ${res.status})`);
      setQuick(data.snapshot);
    } catch (e) { setResearchError(e instanceof Error ? e.message : "Snapshot failed"); }
    finally { setResearchLoading(false); }
  }

  async function runDeepResearch() {
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;
    setDeepLoading(true); setResearchError("");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: clean, mode: "deep" })
      });
      const data = safeParse(await res.text(), res.status);
      if (!res.ok) throw new Error(data.error || `Deep research failed (HTTP ${res.status})`);
      setReport(data.report);
    } catch (e) { setResearchError(e instanceof Error ? e.message : "Deep research failed"); }
    finally { setDeepLoading(false); }
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="brandBlock">
          <div className="brandMark">OS</div>
          <div><strong>Opportunity Scanner</strong><span>Equity research workspace</span></div>
        </div>
        <div className="headerMeta"><span className="liveDot"/>Tiingo market data <span className="divider">·</span> Primary-source research</div>
      </header>

      <nav className="modeTabs" aria-label="Research modes">
        <button className={mode === "scan" ? "active" : ""} onClick={() => setMode("scan")}>Market Scanner</button>
        <button className={mode === "research" ? "active" : ""} onClick={() => setMode("research")}>Single Stock Research</button>
      </nav>

      {mode === "scan" ? (
        <>
          <section className="workspaceIntro">
            <div><p className="kicker">MARKET DISCOVERY</p><h1>Surface only the setups that justify attention.</h1><p>Discovery filters narrow the market first. Intraday structure and primary-source catalyst verification determine what survives.</p></div>
            <button className="primaryButton" onClick={scan} disabled={scanLoading}>{scanLoading ? "Scanning market…" : "Run market scan"}</button>
          </section>

          <div className="filterBar"><span>$1–$50</span><span>+5% minimum</span><span>1M+ volume</span><span>RVOL</span><span>VWAP</span><span>HOD proximity</span><span>SEC / FDA verification</span></div>

          {scanLoading && <LoadingPanel text="Screening market data, validating intraday structure, then researching the strongest finalists."/>}
          {scanError && <ErrorPanel text={scanError}/>} 

          {scanResult && <ScanView result={scanResult} openTicker={openTicker} setOpenTicker={setOpenTicker}/>} 
        </>
      ) : (
        <>
          <section className="workspaceIntro researchIntro">
            <div><p className="kicker">SINGLE STOCK</p><h1>Get the fast market snapshot first.</h1><p>Price, chart, VWAP, RVOL, HOD proximity and recent headlines load first. Run deep research only when you want filings, fundamentals, catalysts and capital-structure analysis.</p></div>
            <form className="tickerForm" onSubmit={researchStock}>
              <input aria-label="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="e.g. NVDA" maxLength={10}/>
              <button className="primaryButton" disabled={researchLoading || !ticker.trim()}>{researchLoading ? "Loading snapshot…" : "Analyze stock"}</button>
            </form>
          </section>

          {researchLoading && <LoadingPanel text="Loading Tiingo market data, intraday structure and recent headlines. No AI research yet."/>}
          {researchError && <ErrorPanel text={researchError}/>} 
          {quick && !report && <QuickResearchView snapshot={quick} deepLoading={deepLoading} onDeep={runDeepResearch}/>}
          {deepLoading && <LoadingPanel text="Deep research is checking SEC filings, fundamentals, catalysts, dilution risk and primary sources. This is the slower step."/>}
          {report && <ResearchView report={report}/>} 
          {!quick && !report && !researchLoading && !researchError && <EmptyResearch/>}
        </>
      )}

      <footer>Research assistance only. Verify live prices, filings and material facts independently before making financial decisions.</footer>
    </main>
  );
}

function LoadingPanel({ text }: { text: string }) {
  return <section className="noticePanel loadingNotice"><div className="progressTrack"><div/></div><strong>Working</strong><p>{text}</p></section>;
}

function ErrorPanel({ text }: { text: string }) {
  return <section className="noticePanel errorNotice"><strong>Request failed</strong><p>{text}</p></section>;
}

function ScanView({ result, openTicker, setOpenTicker }: { result: ScanResult; openTicker: string | null; setOpenTicker: (x: string | null) => void }) {
  return <>
    <section className="verdictPanel">
      <div><p className="kicker">SCAN VERDICT</p><h2>{result.status === "NO_TRADE" ? "No qualifying setup" : "Opportunities found"}</h2><p>{result.status === "NO_TRADE" ? "No finalist cleared the current technical, catalyst and capital-risk standards. The threshold was not lowered." : "At least one finalist cleared the current quality threshold. Review the evidence before acting."}</p></div>
      <div className="statStrip">
        <Metric label="Snapshots" value={compact(result.stats.snapshots)}/><Metric label="Discovery" value={String(result.stats.discoveryPassed)}/><Metric label="Validated" value={String(result.stats.deepValidated)}/><Metric label="Researched" value={String(result.stats.researched ?? 0)}/><Metric label="Duration" value={`${(result.elapsedMs/1000).toFixed(1)}s`}/>
      </div>
    </section>

    <section className="sectionHeading"><div><p className="kicker">FINALISTS</p><h2>Ranked candidates</h2></div><span>{new Date(result.generatedAt).toLocaleString()}</span></section>

    {result.candidates.length === 0 ? <div className="emptyState">No candidates survived the discovery and validation process.</div> : <div className="candidateList">
      {result.candidates.map((c, i) => <CandidateCard key={c.ticker} c={c} rank={i+1} open={openTicker === c.ticker} toggle={() => setOpenTicker(openTicker === c.ticker ? null : c.ticker)}/>) }
    </div>}
  </>;
}

function CandidateCard({ c, rank, open, toggle }: { c: Candidate; rank: number; open: boolean; toggle: () => void }) {
  return <article className="candidateCard">
    <div className="candidateHeader">
      <div className="rankBadge">{rank}</div>
      <div className="candidateIdentity"><strong>{c.ticker}</strong><span>{money(c.currentPrice)} · <em>{c.changePct >= 0 ? "+" : ""}{pct(c.changePct)}</em></span></div>
      <span className={`statusPill ${verdictClass(c.ai?.rating)}`}>{c.ai?.rating || "Watch"}</span>
    </div>
    <div className="metricGrid compactMetrics"><Metric label="Technical" value={`${c.technicalScore}/100`}/><Metric label="Catalyst" value={c.research ? `${c.research.significanceScore}/100` : "Verify"}/><Metric label="RVOL" value={c.rvolVerified && c.rvol ? `${c.rvol.toFixed(1)}x` : "Verify"}/><Metric label="From HOD" value={`-${pct(c.distanceFromHodPct)}`}/><Metric label="VWAP" value={c.aboveVwap == null ? "—" : c.aboveVwap ? "Above" : "Below"}/><Metric label="Volume" value={compact(c.volume)}/></div>
    <div className="candidateBody">
      <div className="summaryBlock"><p className="kicker">ASSESSMENT</p><p>{c.ai?.summary || c.research?.summary || c.technicalReasons.join(" · ") || "Needs confirmation."}</p></div>
      <div className="detailColumns">
        <TextBlock label="Why it's moving" text={c.ai?.whyMoving || c.research?.summary || "No verified fresh catalyst."}/>
        <TextBlock label="Capital structure" text={c.ai?.capitalStructureRisk || (c.research?.dilutionFlags.length ? c.research.dilutionFlags.join("; ") : "Not fully verified")}/>
        <TextBlock label="Preferred trigger" text={c.ai?.entryTrigger || "No actionable entry established"}/>
        <TextBlock label="Invalidation" text={c.ai?.invalidation || "Not established"}/>
      </div>
      {c.research?.primarySources?.length ? <SourceLinks sources={c.research.primarySources.map(s => ({...s, category: s.sourceType})) as any}/> : null}
      <button className="secondaryButton" onClick={toggle}>{open ? "Hide intraday chart" : "View intraday chart"}</button>
      {open && <StockChart bars={c.bars}/>} 
    </div>
  </article>;
}

function QuickResearchView({ snapshot, deepLoading, onDeep }: { snapshot: QuickStockSnapshot; deepLoading: boolean; onDeep: () => void }) {
  return <div className="researchReport">
    <section className="reportHero quickHero">
      <div>
        <div className="reportTickerLine"><span>{snapshot.ticker}</span><span className="quickBadge">QUICK SNAPSHOT</span></div>
        <h2>{snapshot.ticker} market snapshot</h2>
        <p>{snapshot.technical.reasons.join(" · ") || "Current intraday structure loaded from Tiingo."}</p>
      </div>
      <div className="quoteBlock"><strong>{money(snapshot.currentPrice)}</strong><span className={snapshot.changePct >= 0 ? "positive" : "negative"}>{snapshot.changePct >= 0 ? "+" : ""}{pct(snapshot.changePct)}</span><small>Technical {snapshot.technical.score}/100</small></div>
    </section>

    <section className="metricGrid reportMetrics">
      <Metric label="Technical" value={`${snapshot.technical.score}/100`}/><Metric label="RVOL" value={snapshot.technical.rvolVerified && snapshot.technical.rvol ? `${snapshot.technical.rvol.toFixed(1)}x` : "Verify"}/><Metric label="From HOD" value={`-${pct(snapshot.technical.distanceFromHodPct)}`}/><Metric label="VWAP" value={snapshot.technical.aboveVwap == null ? "—" : snapshot.technical.aboveVwap ? "Above" : "Below"}/><Metric label="Volume" value={compact(snapshot.volume)}/><Metric label="HOD" value={money(snapshot.high)}/>
    </section>

    <section className="reportSection"><div className="sectionHeading inner"><div><p className="kicker">MARKET STRUCTURE</p><h2>Intraday chart</h2></div><span>LOD {money(snapshot.low)} · VWAP {money(snapshot.technical.vwap)}</span></div><StockChart bars={snapshot.bars}/></section>

    <section className="reportGrid twoCol">
      <ReportCard title="Technical read"><p>{snapshot.technical.reasons.join(" · ") || "No strong technical confirmation."}</p>{snapshot.technical.warnings.length > 0 && <BulletList items={snapshot.technical.warnings}/>}</ReportCard>
      <ReportCard title="Recent headlines">{snapshot.news.length ? <ul className="headlineList">{snapshot.news.slice(0,5).map((n,i)=><li key={i}>{n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a> : n.title}<span>{n.source || "News"}{n.publishedDate ? ` · ${new Date(n.publishedDate).toLocaleString()}` : ""}</span></li>)}</ul> : <p className="muted">No recent Tiingo headlines returned.</p>}</ReportCard>
    </section>

    <section className="deepResearchCallout"><div><p className="kicker">OPTIONAL</p><h2>Need the full thesis?</h2><p>Deep Research checks SEC filings, earnings, fundamentals, catalyst verification, dilution/capital structure and biotech sources when relevant.</p></div><button className="primaryButton" onClick={onDeep} disabled={deepLoading}>{deepLoading ? "Researching…" : "Run deep research"}</button></section>
  </div>;
}

function ResearchView({ report }: { report: SingleStockReport }) {
  return <div className="researchReport">
    <section className="reportHero">
      <div>
        <div className="reportTickerLine"><span>{report.ticker}</span><span className={`statusPill ${verdictClass(report.verdict)}`}>{report.verdict}</span></div>
        <h2>{report.companyName}</h2>
        <p>{report.thesis}</p>
      </div>
      <div className="quoteBlock"><strong>{money(report.currentPrice)}</strong><span className={report.changePct >= 0 ? "positive" : "negative"}>{report.changePct >= 0 ? "+" : ""}{pct(report.changePct)}</span><small>Confidence {report.confidence}/100</small></div>
    </section>

    <section className="metricGrid reportMetrics">
      <Metric label="Technical" value={`${report.technical.score}/100`}/><Metric label="Catalyst" value={`${report.catalyst.qualityScore}/100`}/><Metric label="RVOL" value={report.technical.rvolVerified && report.technical.rvol ? `${report.technical.rvol.toFixed(1)}x` : "Verify"}/><Metric label="From HOD" value={`-${pct(report.technical.distanceFromHodPct)}`}/><Metric label="VWAP" value={report.technical.aboveVwap == null ? "—" : report.technical.aboveVwap ? "Above" : "Below"}/><Metric label="Volume" value={compact(report.volume)}/>
    </section>

    <section className="reportSection"><div className="sectionHeading inner"><div><p className="kicker">MARKET STRUCTURE</p><h2>Intraday chart</h2></div><span>HOD {money(report.high)} · LOD {money(report.low)}</span></div><StockChart bars={report.bars}/></section>

    <section className="reportGrid twoCol">
      <ReportCard title="Why the stock is moving"><p>{report.whyMoving}</p></ReportCard>
      <ReportCard title="Catalyst verification"><div className="cardLine"><span>{report.catalyst.type}</span><span className="muted">{report.catalyst.status} · {report.catalyst.freshness}</span></div><p>{report.catalyst.summary}</p></ReportCard>
    </section>

    <section className="reportSection">
      <div className="sectionHeading inner"><div><p className="kicker">BUSINESS QUALITY</p><h2>Fundamentals</h2></div></div>
      <div className="fundamentalGrid">
        <TextBlock label="Revenue / growth" text={report.fundamentals.revenue}/><TextBlock label="Earnings" text={report.fundamentals.earnings}/><TextBlock label="Margins" text={report.fundamentals.margins}/><TextBlock label="Free cash flow" text={report.fundamentals.freeCashFlow}/><TextBlock label="Cash & debt" text={report.fundamentals.cashAndDebt}/><TextBlock label="Valuation" text={report.fundamentals.valuation}/><TextBlock label="Guidance" text={report.fundamentals.guidance}/><TextBlock label="Competitive position" text={report.fundamentals.competitivePosition}/>
      </div>
    </section>

    <section className="damagePanel">
      <div><p className="kicker">PRICE DAMAGE VS BUSINESS DAMAGE</p><h2>{report.priceVsBusinessDamage.assessment}</h2><p>{report.priceVsBusinessDamage.conclusion}</p></div>
      <div className="damageCompare"><TextBlock label="Price damage" text={report.priceVsBusinessDamage.priceDamage}/><TextBlock label="Business damage" text={report.priceVsBusinessDamage.businessDamage}/></div>
    </section>

    <section className="reportGrid twoCol">
      <ReportCard title="Capital structure" badge={report.capitalStructure.risk}><p>{report.capitalStructure.summary}</p>{report.capitalStructure.flags.length > 0 && <BulletList items={report.capitalStructure.flags}/>}</ReportCard>
      <ReportCard title="Technical timing"><p>{report.technical.reasons.join(" · ") || "No strong technical confirmation."}</p>{report.technical.warnings.length > 0 && <BulletList items={report.technical.warnings}/>}</ReportCard>
    </section>

    {report.biotech.relevant && <section className="reportSection"><div className="sectionHeading inner"><div><p className="kicker">BIOTECH / CLINICAL</p><h2>Scientific quality vs stock quality</h2></div></div><div className="reportGrid twoCol"><ReportCard title="Scientific / clinical"><p>{report.biotech.scientificQuality}</p><p>{report.biotech.trialContext}</p><p>{report.biotech.fdaStatus}</p></ReportCard><ReportCard title="Capital quality"><p>{report.biotech.capitalQuality}</p><p>{report.biotech.cashRunway}</p>{report.biotech.warnings.length > 0 && <BulletList items={report.biotech.warnings}/>}</ReportCard></div></section>}

    <section className="reportGrid twoCol">
      <ReportCard title="Bull case"><BulletList items={report.bullCase}/></ReportCard>
      <ReportCard title="Bear case"><BulletList items={report.bearCase}/></ReportCard>
      <ReportCard title="Upcoming catalysts"><BulletList items={report.upcomingCatalysts}/></ReportCard>
      <ReportCard title="What changes the thesis"><BulletList items={report.whatChangesThesis}/></ReportCard>
    </section>

    <section className="executionPanel"><div><span>Preferred entry / trigger</span><strong>{report.preferredEntry}</strong></div><div><span>Invalidation</span><strong>{report.invalidation}</strong></div><div><span>Risk / reward</span><strong>{report.riskReward}</strong></div>{report.targets.length > 0 && <div><span>Potential targets</span><strong>{report.targets.join(" · ")}</strong></div>}</section>

    {report.sources.length > 0 && <section className="reportSection"><div className="sectionHeading inner"><div><p className="kicker">EVIDENCE</p><h2>Sources reviewed</h2></div></div><SourceLinks sources={report.sources}/></section>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function TextBlock({ label, text }: { label: string; text: string }) { return <div className="textBlock"><span>{label}</span><p>{text}</p></div>; }
function ReportCard({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) { return <article className="reportCard"><div className="reportCardTitle"><h3>{title}</h3>{badge && <span>{badge}</span>}</div>{children}</article>; }
function BulletList({ items }: { items: string[] }) { return items.length ? <ul className="bulletList">{items.map((x,i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">No material items identified.</p>; }
function SourceLinks({ sources }: { sources: { title: string; url: string; domain: string; category?: string }[] }) { return <div className="sourceGrid">{sources.map((s,i) => <a key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer"><span>{s.category || "Source"}</span><strong>{s.title}</strong><small>{s.domain}</small></a>)}</div>; }
function EmptyResearch() { return <section className="emptyResearch"><div className="emptyMonogram">R</div><h2>Start with a ticker.</h2><p>Use this mode when you already have a stock in mind and want a deeper answer than the market-wide scanner provides.</p><div><span>Fundamentals</span><span>SEC / dilution</span><span>Catalysts</span><span>Technicals</span><span>Biotech if relevant</span></div></section>; }
