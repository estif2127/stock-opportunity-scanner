"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, HistogramSeries } from "lightweight-charts";
import type { Bar } from "@/lib/types";

export default function StockChart({ bars }: { bars: Bar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !bars.length) return;
    const chart = createChart(ref.current, {
      height: 340,
      layout: { background: { color: "#ffffff" }, textColor: "#667085" },
      grid: { vertLines: { color: "#f2f4f7" }, horzLines: { color: "#f2f4f7" } },
      rightPriceScale: { borderColor: "#e4e7ec" },
      timeScale: { borderColor: "#e4e7ec", timeVisible: true, secondsVisible: false }
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: "#087443", downColor: "#b42318", borderVisible: false, wickUpColor: "#087443", wickDownColor: "#b42318" });
    candles.setData(bars.map((b) => ({ time: Math.floor(new Date(b.date).getTime()/1000) as never, open:b.open, high:b.high, low:b.low, close:b.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top:.79, bottom:0 } });
    volume.setData(bars.map((b) => ({ time: Math.floor(new Date(b.date).getTime()/1000) as never, value:b.volume })));
    chart.timeScale().fitContent();
    const resize=()=>chart.applyOptions({width:ref.current?.clientWidth||600}); resize(); window.addEventListener("resize",resize);
    return()=>{window.removeEventListener("resize",resize);chart.remove();};
  },[bars]);
  return <div ref={ref} className="chart"/>;
}
