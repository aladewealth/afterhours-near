import type { AgentReport } from "@/lib/agent";
import { directionLabel } from "@/lib/agent";
import { NEAR_AGENT_ACCOUNT, NEAR_EXPLORER, NEAR_RESOLVER_ACCOUNT, fromE6, type NearBoard, type NearCall } from "@/lib/near";
import { formatPct, formatUsd } from "@/lib/format";
import { NearCallComposer } from "./NearCallComposer";

function dirTone(d: number) {
  if (d > 0) return "bg-[var(--up-dim)] text-[var(--up)]";
  if (d < 0) return "bg-[var(--down-dim)] text-[var(--down)]";
  return "bg-white/10 text-[var(--text)]";
}

function fmtWat(ms: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)) + " WAT";
}

function shortAcc(a: string) {
  return a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a;
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-[var(--amber)]" style={{ width: `${value}%` }} />
    </div>
  );
}

function Resolution({ c }: { c: NearCall }) {
  if (!c.resolution) return <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[var(--muted)]">open</span>;
  const r = c.resolution;
  return (
    <span className={`rounded-full px-1.5 py-0.5 font-medium ${r.hit ? "bg-[var(--up-dim)] text-[var(--up)]" : "bg-[var(--down-dim)] text-[var(--down)]"}`} title={`Graded by ${r.resolved_by} at ${fmtWat(r.resolved_at_ms)}`}>
      {r.hit ? "hit" : "miss"} · NAV {formatUsd(fromE6(r.open_price_e6), 2)}
    </span>
  );
}

export function NearDesk({ report, board, tickers }: { report: AgentReport; board: NearBoard; tickers: string[] }) {
  const s = board.stats;
  return (
    <section id="agent" className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--live)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--live)]" />
            </span>
            <h2 className="text-sm font-medium text-white">Caller agent · current read</h2>
          </div>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--muted)]">
            {report.llm.enabled && !report.llm.error ? `Notes by NEAR AI Cloud · ${report.llm.model}` : "Rule engine (NEAR AI notes off)"}
          </span>
        </div>
        <div className="px-4 py-3 text-xs leading-5 text-[var(--muted)]">
          Scans {report.scanned} tokenized stocks with an official NAV. {report.marketOpen
            ? `Cash session is open, so NAV is live: gaps over ${report.thresholdPct}% are called "converge".`
            : `Cash session is closed, so NAV is frozen: DEX gaps over ${report.thresholdPct}% are read as the next-open gap.`}{" "}
          Every 30 minutes the agent signs <span className="num">post_call</span> on <span className="num">{board.contract}</span> with a function-call key. The contract checks its policy first.
        </div>
        {report.calls.length === 0 ? (
          <div className="mx-4 mb-4 rounded-xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            No gap is wide enough to call right now. The agent stays quiet instead of posting noise.
          </div>
        ) : (
          <ul className="flex flex-col gap-2 px-4 pb-4">
            {report.calls.slice(0, 5).map((c) => (
              <li key={c.ticker} className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{c.ticker}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${dirTone(c.direction)}`}>{directionLabel(c.direction)}</span>
                    <span className="num text-xs text-[var(--muted)]">{formatPct(c.premiumPct)}</span>
                  </div>
                  <div className="num text-[11px] text-[var(--muted)]">
                    {formatUsd(c.dexPrice, 2)} vs {formatUsd(c.navPrice, 2)}
                  </div>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[var(--text)]">{c.note}</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[11px] text-[var(--muted)]">Confidence {c.confidence}</span>
                  <ConfidenceBar value={c.confidence} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {report.skipped.length > 0 && (
          <details className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer select-none">Why the agent skipped {report.skipped.length} tickers</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {report.skipped.map((x) => (
                <li key={x.ticker}>
                  <span className="text-[var(--text)]">{x.ticker}</span> · {x.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-medium text-white">Board · NEAR testnet</h2>
            <a href={`${NEAR_EXPLORER}/address/${board.contract}`} target="_blank" rel="noreferrer" className="num text-[11px] text-[var(--amber)] hover:underline">
              {board.contract} ↗
            </a>
          </div>
          <div className="grid grid-cols-4 gap-px bg-[var(--line)] text-center">
            {[
              { k: "Agent calls", v: s?.agent_calls ?? 0 },
              { k: "Community", v: s?.community_calls ?? 0 },
              { k: "Graded", v: s?.resolved_calls ?? 0 },
              { k: "Blocked", v: s?.blocked_attempts ?? 0 },
            ].map((x) => (
              <div key={x.k} className="bg-[var(--bg-row)] px-2 py-2">
                <div className="num text-lg text-white">{x.v}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{x.k}</div>
              </div>
            ))}
          </div>
          {!board.ok && <div className="px-4 py-2 text-[11px] text-[var(--amber)]">Feed unavailable: {board.error}</div>}
          {board.calls.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">No calls posted yet.</p>
          ) : (
            <ol className="max-h-[460px] divide-y divide-[var(--line)] overflow-y-auto">
              {board.calls.slice(0, 30).map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-[var(--muted)]">#{c.id}</span>
                      <span className="font-medium text-white">{c.ticker}</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-medium ${dirTone(c.direction)}`}>{directionLabel(c.direction)}</span>
                      <span className={`rounded-full px-1.5 py-0.5 ${c.by_agent ? "bg-[rgba(94,234,212,0.12)] text-[var(--live)]" : "bg-white/5 text-[var(--muted)]"}`}>
                        {c.author === NEAR_AGENT_ACCOUNT ? "Agent" : shortAcc(c.author)}
                      </span>
                      <Resolution c={c} />
                    </div>
                    <span className="text-[var(--muted)]">{fmtWat(c.posted_at_ms)}</span>
                  </div>
                  {c.note && <p className="mt-1.5 text-xs leading-5 text-[var(--text)]/90">{c.note}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--muted)]">
            Caller <a className="num hover:text-[var(--amber)]" href={`${NEAR_EXPLORER}/address/${NEAR_AGENT_ACCOUNT}`} target="_blank" rel="noreferrer">{NEAR_AGENT_ACCOUNT}</a> · resolver{" "}
            <a className="num hover:text-[var(--amber)]" href={`${NEAR_EXPLORER}/address/${NEAR_RESOLVER_ACCOUNT}`} target="_blank" rel="noreferrer">{NEAR_RESOLVER_ACCOUNT}</a> · testnet, no funds at risk
          </div>
        </div>
        <NearCallComposer contract={board.contract} tickers={tickers} />
      </div>
    </section>
  );
}
