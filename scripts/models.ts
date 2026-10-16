// Day-one check: list Nemotron models actually served by Token Factory, and
// confirm the three configured tier IDs exist. Free (no inference).
import "dotenv/config";
import { TIERS, TOKEN_FACTORY_BASE_URL } from "../src/lib/config";

async function main() {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) {
    console.error("NEBIUS_API_KEY is not set. Put it in .env first.");
    process.exit(1);
  }
  const res = await fetch(`${TOKEN_FACTORY_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const data = (await res.json()) as { data: { id: string }[] };
  const ids = data.data.map((m) => m.id);
  const nemotron = ids.filter((id) => /nemotron/i.test(id));
  console.log("Nemotron models served:\n  " + nemotron.join("\n  "));

  let ok = true;
  for (const t of Object.values(TIERS)) {
    const found = ids.includes(t.model);
    if (!found) ok = false;
    console.log(`${found ? "OK  " : "MISSING"} ${t.tier.padEnd(5)} -> ${t.model}`);
  }
  if (!ok) {
    console.log("\nSet MODEL_NANO / MODEL_SUPER / MODEL_ULTRA in .env to the exact IDs listed above.");
    process.exit(2);
  }
}
main();
