import type { Bar, Candidate, Snapshot } from "./types";

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function discoveryFilter(s: Snapshot): boolean {
  if (!n(s.tngoLast) || !n(s.prevClose) || !n(s.volume) || !n(s.high) || !n(s.low)) return false;
  if (s.tngoLast < 1 || s.tngoLast > 50) return false;
  if (s.volume < 1_000_000) return false;
  if (s.prevClose <= 0) return false;
  const changePct = ((s.tngoLast - s.prevClose) / s.prevClose) * 100;
  return changePct >= 5;
}

export function rankDiscovery(s: Snapshot): number {
  if (!n(s.tngoLast) || !n(s.prevClose) || !n(s.volume) || !n(s.high) || s.high <= 0) return -999;
  const change = ((s.tngoLast - s.prevClose) / s.prevClose) * 100;
  const distHod = ((s.high - s.tngoLast) / s.high) * 100;
  const liquidity = Math.log10(Math.max(1, s.tngoLast * s.volume));
  return change * 0.7 + Math.max(0, 8 - distHod) * 2 + liquidity * 2;
}

function sessionBars(bars: Bar[]): Bar[] {
  if (!bars.length) return [];
  const latestDay = bars[bars.length - 1].date.slice(0, 10);
  return bars.filter((b) => b.date.slice(0, 10) === latestDay);
}

export function calcVwap(bars: Bar[]): number | null {
  const current = sessionBars(bars);
  let pv = 0;
  let vol = 0;
  for (const b of current) {
    if (!n(b.volume) || b.volume <= 0) continue;
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
  }
  return vol > 0 ? pv / vol : null;
}

export function calcVolumeAcceleration(bars: Bar[]): number | null {
  const current = sessionBars(bars);
  if (current.length < 8) return null;
  const recent = current.slice(-3).reduce((s, b) => s + (b.volume || 0), 0) / 3;
  const prior = current.slice(Math.max(0, current.length - 15), -3);
  if (!prior.length) return null;
  const baseline = prior.reduce((s, b) => s + (b.volume || 0), 0) / prior.length;
  return baseline > 0 ? recent / baseline : null;
}

export function calcHigherLows(bars: Bar[]): boolean | null {
  const current = sessionBars(bars);
  if (current.length < 6) return null;
  const lows = current.slice(-4).map((b) => b.low);
  return lows[1] >= lows[0] && lows[2] >= lows[1] && lows[3] >= lows[2];
}

export function calcComparableRvol(bars: Bar[]): { value: number | null; verified: boolean } {
  if (!bars.length) return { value: null, verified: false };
  const grouped = new Map<string, Bar[]>();
  for (const b of bars) {
    const d = b.date.slice(0, 10);
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d)!.push(b);
  }
  const days = [...grouped.keys()].sort();
  if (days.length < 4) return { value: null, verified: false };
  const today = days[days.length - 1];
  const todayBars = grouped.get(today)!;
  const elapsedBars = todayBars.length;
  if (elapsedBars < 2) return { value: null, verified: false };
  const currentVol = todayBars.reduce((s, b) => s + (b.volume || 0), 0);
  const previous = days.slice(Math.max(0, days.length - 11), -1);
  const comps = previous
    .map((d) => grouped.get(d)!.slice(0, elapsedBars).reduce((s, b) => s + (b.volume || 0), 0))
    .filter((v) => v > 0);
  if (comps.length < 3) return { value: null, verified: false };
  const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
  return { value: avg > 0 ? currentVol / avg : null, verified: avg > 0 };
}

export function buildCandidate(s: Snapshot, bars: Bar[]): Candidate {
  const price = s.tngoLast!;
  const high = s.high!;
  const prevClose = s.prevClose!;
  const changePct = ((price - prevClose) / prevClose) * 100;
  const distanceFromHodPct = high > 0 ? ((high - price) / high) * 100 : 999;
  const vwap = calcVwap(bars);
  const rvol = calcComparableRvol(bars);
  const volumeAcceleration = calcVolumeAcceleration(bars);
  const higherLows = calcHigherLows(bars);
  const spreadPct = n(s.lqSpread)
    ? s.lqSpread * 100
    : n(s.lqBidPrice) && n(s.lqAskPrice) && price > 0
      ? ((s.lqAskPrice - s.lqBidPrice) / price) * 100
      : null;
  const aboveVwap = vwap == null ? null : price >= vwap;

  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (rvol.verified && rvol.value != null) {
    if (rvol.value >= 5) { score += 20; reasons.push(`RVOL ${rvol.value.toFixed(1)}x`); }
    else if (rvol.value >= 3) { score += 16; reasons.push(`RVOL ${rvol.value.toFixed(1)}x`); }
    else if (rvol.value >= 2) score += 8;
    else warnings.push(`RVOL only ${rvol.value.toFixed(1)}x`);
  } else warnings.push("RVOL needs live/history confirmation");

  if (volumeAcceleration != null) {
    if (volumeAcceleration >= 1.75) { score += 15; reasons.push("Volume accelerating"); }
    else if (volumeAcceleration >= 1.2) score += 10;
    else score += 3;
  }

  if (distanceFromHodPct <= 3) { score += 15; reasons.push("Within 3% of HOD"); }
  else if (distanceFromHodPct <= 5) score += 11;
  else if (distanceFromHodPct <= 8) score += 5;
  else warnings.push(`${distanceFromHodPct.toFixed(1)}% below HOD`);

  if (aboveVwap === true) { score += 15; reasons.push("Above VWAP"); }
  else if (aboveVwap === false) warnings.push("Below VWAP");

  if (higherLows === true) { score += 10; reasons.push("Recent higher lows"); }
  else if (higherLows === false) score += 2;

  if (spreadPct != null) {
    if (spreadPct <= 0.3) { score += 10; reasons.push("Tight liquidity spread"); }
    else if (spreadPct <= 0.7) score += 7;
    else if (spreadPct <= 1.5) score += 3;
    else warnings.push(`Wide ${spreadPct.toFixed(2)}% spread`);
  } else warnings.push("Spread unavailable");

  const dollarVolume = price * s.volume!;
  if (dollarVolume >= 20_000_000) score += 10;
  else if (dollarVolume >= 5_000_000) score += 7;
  else score += 3;

  if (changePct >= 5 && changePct <= 35) score += 5;
  else if (changePct <= 60) score += 3;
  else warnings.push("Parabolic move / chase risk");

  return {
    ticker: s.ticker,
    currentPrice: price,
    changePct,
    volume: s.volume!,
    high,
    low: s.low!,
    prevClose,
    distanceFromHodPct,
    spreadPct,
    dollarVolume,
    vwap,
    rvol: rvol.value,
    rvolVerified: rvol.verified,
    volumeAcceleration,
    higherLows,
    aboveVwap,
    technicalScore: Math.min(100, score),
    technicalReasons: reasons,
    warnings,
    news: [],
    bars
  };
}
