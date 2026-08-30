import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Opportunity Scanner",
  description: "Conservative market scanner using Tiingo and OpenAI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
