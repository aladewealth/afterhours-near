import type { AgentState } from "@/lib/agentState";
import { directionLabel } from "@/lib/agent";
import { BLOCKSCOUT, EXPLORER } from "@/lib/contracts";
import { formatIsoWat, formatPct, formatUsd } from "@/lib/format";
import { CallComposer } from "./CallComposer";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function dirTone(d: number) {
  if (d > 0) return "bg-[var(--up-dim)] text-[var(--up)]";
  if (d < 0) return "bg-[var(--down-dim)] text-[var(--down)]";
  return "bg-white/10 text-[var(--text)]";
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-[var(--amber)]" style={{ width: `${value}%` }} />
    </div>
  );
}

export function AgentDesk({ state, tickers }: { state: AgentState; tickers: string[] }) {
  const { report, feed, mode } = state;
  const agentPosts = feed.calls.filter((c) => c.byAgent).length;
  const communityPosts = feed.calls.length - agentPosts;
  const lastAgent = feed.calls.find((c) => c.byAgent);
  // eslint-disable-next-line react-hooks/purity
  const agentActive = mode === "onchain" || (lastAgent ? Date.now() - Date.parse(lastAgent.postedAt) < 24 * 3600_000 : false);

  return (
    <section id="agent" className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      {/* Agent brain */}
      <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--live)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--live)]" />
            </span>
            <h2 className="text-sm font-medium text-white">AfterHours Agent · current read</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              title={mode === "onchain" ? "This server signs and posts the agent's calls." : "The agent signs from its own runner every 30 min; this page only reads the chain."}
              className={`rounded-full px-2 py-0.5 font-medium ${agentActive ? "bg-[var(--up-dim)] text-[var(--up)]" : "bg-[var(--amber-dim)] text-[var(--amber)]"}`}
            >
              {mode === "onchain" ? "Posting onchain" : agentActive ? "Posting onchain · every 30 min" : "Agent paused"}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[var(--muted)]">
              {report.llm.enabled && !report.llm.error ? `LLM notes · ${report.llm.model}` : "Rule engine (no API key)"}
            </span>
          </div>
        </div>
        <div className="px-4 py-3 text-xs leading-5 text-[var(--muted)]">
          Scans {report.scanned} tokenized stocks with an official NAV. {report.marketOpen
            ? `Cash session is open, so NAV is live: gaps over ${report.thresholdPct}% are called "converge".`
            : `Cash session is closed, so NAV is frozen: DEX gaps over ${report.thresholdPct}% are read as the next-open gap.`}{" "}
          Pools under $100k liquidity are ignored. Calls go to <span className="num">AfterHoursBoard.postCall</span> on Base Sepolia.
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.signals.map((s) => (
                    <span key={s} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">{s}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {report.skipped.length > 0 && (
          <details className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer select-none">Why the agent skipped {report.skipped.length} tickers</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {report.skipped.map((s) => (
                <li key={s.ticker}>
                  <span className="text-[var(--text)]">{s.ticker}</span> · {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Onchain activity */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-medium text-white">Agent activity · onchain</h2>
            {state.boardAddress && (
              <a href={`${EXPLORER}/address/${state.boardAddress}#events`} target="_blank" rel="noreferrer" className="num text-[11px] text-[var(--amber)] hover:underline">
                Board {short(state.boardAddress)} ↗
              </a>
            )}
          </div>
          <div className="grid grid-cols-3 gap-px bg-[var(--line)] text-center">
            {[
              { k: "Agent calls", v: agentPosts },
              { k: "Community calls", v: communityPosts },
              { k: "Wallets", v: feed.uniqueWallets },
            ].map((s) => (
              <div key={s.k} className="bg-[var(--bg-row)] px-2 py-2">
                <div className="num text-lg text-white">{s.v}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{s.k}</div>
              </div>
            ))}
          </div>
          {!feed.ok && <div className="px-4 py-2 text-[11px] text-[var(--amber)]">Feed unavailable: {feed.error}</div>}
          {feed.calls.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">No calls posted yet.</p>
          ) : (
            <ol className="max-h-[420px] divide-y divide-[var(--line)] overflow-y-auto">
              {feed.calls.slice(0, 20).map((c) => (
                <li key={c.callId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="num text-[var(--muted)]">#{c.callId}</span>
                      <span className="font-medium text-white">{c.ticker}</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-medium ${dirTone(c.direction)}`}>{directionLabel(c.direction)}</span>
                      <span className={`rounded-full px-1.5 py-0.5 ${c.byAgent ? "bg-[rgba(94,234,212,0.12)] text-[var(--live)]" : "bg-white/5 text-[var(--muted)]"}`}>
                        {c.byAgent ? "Agent" : short(c.user)}
                      </span>
                    </div>
                    <a href={`${EXPLORER}/tx/${c.txHash}`} target="_blank" rel="noreferrer" className="text-[var(--muted)] hover:text-[var(--amber)]">
                      {formatIsoWat(c.postedAt)} ↗
                    </a>
                  </div>
                  {c.note && <p className="mt-1.5 text-xs leading-5 text-[var(--text)]/90">{c.note}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--muted)]">
            Agent wallet <a className="num hover:text-[var(--amber)]" href={`${BLOCKSCOUT}/address/${state.agentAddress}`} target="_blank" rel="noreferrer">{short(state.agentAddress)}</a> · Base Sepolia testnet · no funds at risk
          </div>
        </div>
        {state.boardAddress && <CallComposer board={state.boardAddress} tickers={tickers} />}
      </div>
    </section>
  );
}
