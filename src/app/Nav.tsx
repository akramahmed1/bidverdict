"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Opportunities" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/eval", label: "Accuracy" },
  { href: "/ledger", label: "Ledger" },
];

export function Nav() {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" || path.startsWith("/case") : path.startsWith(h));
  return (
    <nav aria-label="Main">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}>{i.label}</Link>
      ))}
      <a href="https://github.com/akramahmed1/bidverdict">Source</a>
    </nav>
  );
}
