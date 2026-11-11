import { NEAR_AGENT_ACCOUNT, type NearBoard } from "@/lib/near";

/** Hit-rate per author, computed by the contract from graded calls. Agents and people on one table. */
export function Leaderboard({ board }: { board: NearBoard }) {
  const rows = board.leaderboard;
  return (
    <section id="leaderboard" className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-medium text-white">Track record · agent vs people</h2>
        <p className="text-[11px] text-[var(--muted)]">Graded by the resolver agent against the official NAV. Nobody grades their own call.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">No authors yet.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Author</th>
              <th className="px-4 py-2 text-right font-medium">Calls</th>
              <th className="px-4 py-2 text-right font-medium">Graded</th>
              <th className="px-4 py-2 text-right font-medium">Hits</th>
              <th className="px-4 py-2 text-right font-medium">Hit rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account_id} className="border-t border-[var(--line)]">
                <td className="px-4 py-2">
                  <span className="num text-white">{r.account_id === NEAR_AGENT_ACCOUNT ? "AfterHours Agent" : r.account_id}</span>
                  {r.is_agent && <span className="ml-2 rounded-full bg-[rgba(94,234,212,0.12)] px-1.5 py-0.5 text-[10px] text-[var(--live)]">agent</span>}
                </td>
                <td className="num px-4 py-2 text-right">{r.stats.calls}</td>
                <td className="num px-4 py-2 text-right">{r.stats.resolved}</td>
                <td className="num px-4 py-2 text-right">{r.stats.hits}</td>
                <td className="num px-4 py-2 text-right text-white">{r.stats.resolved ? `${(r.hit_rate_bps / 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
