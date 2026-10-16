import { readLedger, spentUsd } from "@/lib/ledger";
export const dynamic = "force-dynamic";

export default function LedgerPage() {
  const all = readLedger();
  const entries = all.slice(-200).reverse();
  return (
    <>
      <h1>Ledger</h1>
      <p className="mut">
        Every model call, tool call, gate decision, dropped claim and approval from live runs on this machine, with tokens, cost and latency.
        Total model spend recorded: <strong>${spentUsd(all).toFixed(4)}</strong> across {all.length} entries.
      </p>
      {entries.length === 0 ? (
        <p className="mut">No local ledger entries. The hosted demo replays saved runs; each saved memo carries its own call log.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead><tr>{["Time", "Run", "Kind", "Model / tool", "Tokens in/out", "Cost", "ms"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td>{e.ts.slice(5, 19).replace("T", " ")}</td>
                  <td className="small">{e.runId}</td>
                  <td>{e.kind}</td>
                  <td className="small">{e.model ?? String(e.detail?.tool ?? e.detail?.decision ?? "")}</td>
                  <td>{e.inputTokens != null ? `${e.inputTokens}/${e.outputTokens}` : ""}</td>
                  <td>{e.costUsd != null ? `$${e.costUsd.toFixed(6)}` : ""}</td>
                  <td>{e.latencyMs ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
