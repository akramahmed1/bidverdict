// Day-1 placeholder screen: shows mode (LIVE / REPLAY-ONLY / MOCK), configured tiers,
// and the latest ledger entries. The full judge flow lands on Oct 21.
import { CAPS, TIERS, hasLiveKeys, isMockMode } from "@/lib/config";
import { readLedger, spentUsd } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default function Home() {
  const mock = isMockMode();
  const live = hasLiveKeys();
  const entries = readLedger().slice(-25).reverse();
  const spent = spentUsd(readLedger());

  const mode = mock ? "MOCK (developer fixtures)" : live ? "LIVE" : "REPLAY ONLY (no API key: live runs disabled)";

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ marginBottom: 4 }}>BidVerdict</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Should a small contractor bid on this? A sourced answer, checked by rules first, decided by a human.
      </p>

      <p>
        <strong>Mode:</strong>{" "}
        <span style={{ padding: "2px 8px", borderRadius: 4, background: mock ? "#fde68a" : live ? "#bbf7d0" : "#e5e7eb" }}>
          {mode}
        </span>
      </p>

      <h2>Model tiers (NVIDIA Nemotron on Nebius Token Factory)</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["Tier", "Model", "Job", "$ / 1M in", "$ / 1M out", "max_tokens"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 6 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.values(TIERS).map((t) => (
            <tr key={t.tier}>
              <td style={{ padding: 6 }}>{t.tier}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 13 }}>{t.model}</td>
              <td style={{ padding: 6 }}>{t.job}</td>
              <td style={{ padding: 6 }}>{t.priceInPerM}</td>
              <td style={{ padding: 6 }}>{t.priceOutPerM}</td>
              <td style={{ padding: 6 }}>{t.maxTokens}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Budget guard</h2>
      <p>
        Per run ${CAPS.perRunUsd} · Daily live ${CAPS.dailyLiveUsd} · Global ${CAPS.globalUsd} · Max loops {CAPS.maxLoops} · Spent so
        far ${spent.toFixed(4)}
      </p>

      <h2>Ledger (latest 25)</h2>
      {entries.length === 0 ? (
        <p style={{ color: "#666" }}>No entries yet. Run <code>npm run smoke</code> to make the first live call.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              {["Time", "Run", "Kind", "Model / tool", "Tokens in/out", "Cost", "ms"].map((h) => (
                <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}>{e.ts.slice(11, 19)}</td>
                <td style={{ padding: 4 }}>{e.runId}</td>
                <td style={{ padding: 4 }}>{e.kind}</td>
                <td style={{ padding: 4, fontFamily: "monospace" }}>{e.model ?? String(e.detail?.tool ?? "")}</td>
                <td style={{ padding: 4 }}>{e.inputTokens != null ? `${e.inputTokens}/${e.outputTokens}` : ""}</td>
                <td style={{ padding: 4 }}>{e.costUsd != null ? `$${e.costUsd.toFixed(6)}` : ""}</td>
                <td style={{ padding: 4 }}>{e.latencyMs ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
