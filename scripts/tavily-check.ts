// One Tavily search to confirm the key works. Costs 1 credit.
import "dotenv/config";
import { tavilySearch } from "../src/lib/tavily";
async function main() {
  const r = await tavilySearch("tavily-check", "VA IT modernization small business contract awards", { maxResults: 3 });
  console.log(`Tavily OK: ${r.length} results`);
  for (const s of r) console.log(`  [${s.id}] ${s.title.slice(0, 70)}\n       ${s.url}`);
}
main().catch((e) => { console.error("Tavily FAILED:", e.message); process.exit(1); });
