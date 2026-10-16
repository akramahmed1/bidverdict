import type { ReactNode } from "react";

export const metadata = {
  title: "BidVerdict",
  description: "Sourced bid / no-bid decisions for small federal contractors.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafaf7", color: "#1a1a1a" }}>
        {children}
      </body>
    </html>
  );
}
