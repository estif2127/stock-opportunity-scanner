import "server-only";
import type { Bar, NewsItem, Snapshot } from "./types";

const BASE = "https://api.tiingo.com";

function key() {
  const token = process.env.TIINGO_API_KEY;
  if (!token) throw new Error("Missing TIINGO_API_KEY");
  return token;
}

async function tiingoFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Token ${key()}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tiingo ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function getAllSnapshots(): Promise<Snapshot[]> {
  return tiingoFetch<Snapshot[]>("/tiingo/equity/intraday");
}

export async function getBars(ticker: string, startDate: string, endDate: string, resampleFreq = "1min"): Promise<Bar[]> {
  const qs = new URLSearchParams({
    startDate,
    endDate,
    resampleFreq,
    columns: "open,high,low,close,volume",
    afterHours: "false"
  });
  return tiingoFetch<Bar[]>(`/tiingo/equity/intraday/${encodeURIComponent(ticker)}/prices?${qs}`);
}

export async function getNews(tickers: string[]): Promise<NewsItem[]> {
  if (!tickers.length) return [];
  const qs = new URLSearchParams({
    tickers: tickers.join(","),
    limit: "35",
    sortBy: "crawlDate"
  });
  try {
    return await tiingoFetch<NewsItem[]>(`/tiingo/news?${qs}`);
  } catch {
    return [];
  }
}
