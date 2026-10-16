import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "BidVerdict",
  description: "Sourced bid / no-bid decisions for small federal contractors.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav className="nav">
            <Link href="/" className="brand">BidVerdict</Link>
            <Link href="/">Opportunities</Link>
            <Link href="/ledger">Ledger</Link>
            <a href="https://github.com/akramahmed1/bidverdict">Source</a>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
