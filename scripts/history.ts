// Free check of the USAspending module (no keys needed).
// Usage: npm run history -- "Department of Veterans Affairs" 541512
import { awardHistory } from "../src/lib/usaspending";

async function main() {
  const agency = process.argv[2] ?? "Department of Veterans Affairs";
  const naics = process.argv[3] ?? "541512";
  const h = await awardHistory("history-check", agency, naics, { years: 5, limit: 25 });
  console.log(`${agency} / NAICS ${naics}, last ${h.years} years`);
  console.log(`Contract awards: ${h.total}; with small-business set-aside: ${h.smallBizAwards}`);
  console.log(`Median award (top ${h.awards.length} by size): ${h.medianAmount?.toLocaleString("en-US", { style: "currency", currency: "USD" }) ?? "n/a"}`);
  console.log("Top recipients:");
  for (const r of h.topRecipients) console.log(`  ${r.name}  ${r.count} award(s)  $${Math.round(r.amount).toLocaleString()}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
