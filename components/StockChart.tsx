"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, HistogramSeries } from "lightweight-charts";
import type { Bar } from "@/lib/types";

export default function StockChart({ bars }: { bars: Bar[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !bars.length) return;
    const chart = createChart(ref.current, {
      height: 330,
      layout: { background: { color: "#0b1020" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#172033" }, horzLines: { color: "#172033" } },
      rightPriceScale: { borderColor: "#263249" },
      timeScale: { borderColor: "#263249", timeVisible: true, secondsVisible: false }
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444"
    });
    candles.setData(bars.map((b) => ({
      time: Math.floor(new Date(b.date).getTime() / 1000) as never,
      open: b.open, high: b.high, low: b.low, close: b.close
    })));

    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volume.setData(bars.map((b) => ({
      time: Math.floor(new Date(b.date).getTime() / 1000) as never,
      value: b.volume
    })));

    chart.timeScale().fitContent();
    const resize = () => chart.applyOptions({ width: ref.current?.clientWidth || 600 });
    resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.remove(); };
  }, [bars]);

  return <div ref={ref} className="chart" />;
}
