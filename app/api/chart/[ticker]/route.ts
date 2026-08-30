import { NextRequest, NextResponse } from "next/server";
import { getBars } from "@/lib/tiingo";

export const runtime = "nodejs";

function yyyyMmDd(d: Date) { return d.toISOString().slice(0, 10); }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker } = await params;
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
    const bars = await getBars(ticker.toUpperCase(), yyyyMmDd(start), yyyyMmDd(end));
    return NextResponse.json({ ticker: ticker.toUpperCase(), bars });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chart failed" }, { status: 500 });
  }
}
