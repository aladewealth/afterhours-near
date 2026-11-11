import { EXPLORER } from "@/lib/contracts";
import type { BoardStats } from "@/lib/board";
import { DATA_SUFFIX, builderCodes } from "@/lib/attribution";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function UsageStats({ stats }: { stats: BoardStats }) {
  const codes = builderCodes();
  const cards = [
    { label: "Unique wallets", value: String(stats.uniqueWallets) },
    { label: "Total calls", value: String(stats.totalCalls) },
    { label: "Agent calls", value: String(stats.agentCalls) },
    { label: "Community calls", value: String(stats.communityCalls) },
  ];

  return (
    <section id="traction" className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)] px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white">Onchain traction</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Counted from <span className="num">CallPosted</span> and <span className="num">Subscribed</span> events on
            AfterHoursBoard{stats.board ? <> ({short(stats.board)})</> : null}. Useful as Base Builder Grant metrics.
          </p>
        </div>
        <a href="/api/stats" className="num text-[11px] text-[var(--amber)] hover:underline">
          JSON /api/stats
        </a>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{stat.label}</div>
            <div className="mt-1 num text-xl text-white">{stats.ok ? stat.value : "—"}</div>
          </div>
        ))}
      </div>
      {!stats.ok && stats.error && (
        <p className="mt-2 text-[11px] text-[var(--amber)]">Could not refresh events: {stats.error}</p>
      )}
      <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
        {stats.subscribers} subscriber{stats.subscribers === 1 ? "" : "s"} · Base Sepolia
        {stats.board ? (
          <>
            {" · "}
            <a className="hover:text-[var(--amber)]" href={`${EXPLORER}/address/${stats.board}#events`} target="_blank" rel="noreferrer">
              Board events ↗
            </a>
          </>
        ) : null}
        {codes.length > 0 && DATA_SUFFIX ? (
          <>
            {" · "}Builder Code{codes.length > 1 ? "s" : ""}{" "}
            <span className="num text-[var(--text)]">{codes.join(", ")}</span>
          </>
        ) : null}
      </p>
    </section>
  );
}
