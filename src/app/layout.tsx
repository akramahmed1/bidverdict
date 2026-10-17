import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { Nav } from "./Nav";
import { hasLiveKeys, isMockMode } from "@/lib/config";
import { getHostedMode } from "@/lib/mode";

export const metadata = {
  title: "BidVerdict",
  description: "A sourced bid / no-bid memo for small federal contractors, with every claim traced to a source.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const mode = isMockMode() ? "Mock fixtures" : getHostedMode() ? "Replaying saved runs" : hasLiveKeys() ? "Live runs on" : "Replaying saved runs";
  const live = !isMockMode() && !getHostedMode() && hasLiveKeys();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="top">
            <Link href="/" className="wordmark">
              <span className="mark" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              BidVerdict
            </Link>
            <Nav />
            <span className="mode"><span className={`dot ${live ? "live" : ""}`} />{mode}</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
