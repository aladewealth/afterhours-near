import type { FeedState, Snapshot, StockRow } from "@/lib/types";
import type { AgentState } from "@/lib/agentState";
import type { BoardStats } from "@/lib/board";
import { AgentDesk } from "./AgentDesk";
import { UsageStats } from "./UsageStats";
import { formatAge, formatCompact, formatIsoWat, formatPct, formatUsd } from "@/lib/format";

function premiumClass(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "text-[var(--muted)]";
  if (value > 0.02) return "text-[var(--up)]";
  if (value < -0.02) return "text-[var(--down)]";
  return "text-[var(--muted)]";
}

function feedTone(state: FeedState): string {
  switch (state) {
    case "live":
      return "bg-[rgba(94,234,212,0.12)] text-[var(--live)]";
    case "aging":
      return "bg-[var(--amber-dim)] text-[var(--amber)]";
    case "holding":
      return "bg-white/10 text-[var(--muted)]";
    case "stale":
      return "bg-[var(--down-dim)] text-[var(--down)]";
    default:
      return "bg-white/5 text-[var(--muted)]";
  }
}

function feedLabel(state: FeedState): string {
  switch (state) {
    case "live":
      return "Live";
    case "aging":
      return "Aging";
    case "holding":
      return "Holding";
    case "stale":
      return "Stale";
    default:
      return "No NAV";
  }
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function PremiumBar({ value }: { value?: number }) {
  if (value === undefined || !Number.isFinite(value)) {
    return <div className="h-1 w-16 rounded-full bg-white/10" />;
  }
  const max = 1.5;
  const width = Math.min(50, (Math.abs(value) / max) * 50);
  const positive = value >= 0;
  return (
    <div className="relative h-1 w-16 overflow-hidden rounded-full bg-white/10">
      <div
        className={`absolute top-0 h-full ${positive ? "left-1/2 bg-[var(--up)]" : "right-1/2 bg-[var(--down)]"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function Row({ row }: { row: StockRow }) {
  return (
    <tr className="border-t border-[var(--line)] hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {row.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.iconUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full bg-white/5" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-white/10" />
          )}
          <div>
            <div className="font-medium tracking-tight">{row.symbol}</div>
            <div className="text-xs text-[var(--muted)]">{row.name}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right num">{formatUsd(row.navPrice, 3)}</td>
      <td className="px-4 py-3 text-right">
        <div className="num">{formatUsd(row.dex?.priceUsd, 3)}</div>
        <div className="text-[11px] text-[var(--muted)]">
          {row.dex ? `${row.dex.source === "onchain" ? "onchain" : "DexScreener"} · ${row.dex.quoteToken ?? "USD"}` : "no pool"}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <PremiumBar value={row.premiumPct} />
          <span className={`num text-sm font-medium ${premiumClass(row.premiumPct)}`}>
            {formatPct(row.premiumPct)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-xs text-[var(--muted)]">
        <div>{formatCompact(row.dex?.liquidityUsd)}</div>
        <div className="text-[11px]">{formatCompact(row.dex?.volume24hUsd)} 24h</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <Pill className={feedTone(row.feedState)}>{feedLabel(row.feedState)}</Pill>
          <div className="text-[11px] text-[var(--muted)]">{formatAge(row.feedAgeMinutes)}</div>
          <div className="text-[10px] text-[var(--muted)]">{formatIsoWat(row.navUpdatedAt)}</div>
        </div>
      </td>
    </tr>
  );
}

export function Dashboard({ snapshot, agent, stats }: { snapshot: Snapshot; agent?: AgentState; stats: BoardStats }) {
  const { market, rows, otherMinted, warnings } = snapshot;
  const premiums = rows.map((r) => r.premiumPct).filter((v): v is number => v !== undefined);
  const widest = premiums.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[var(--amber)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)] shadow-[0_0_12px_var(--amber)]" />
            <span className="text-xs font-medium uppercase tracking-[0.22em]">AfterHours</span>
          </div>
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
            An AI agent watching the tape after the bell.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] md:text-[15px]">
            Coinbase tokenized stocks keep trading on Base after Wall Street closes. The AfterHours Agent compares
            official NAV with live Aerodrome pool prices, decides which gaps matter, and posts a reasoned call
            onchain. Anyone can post a call against it. Informational only, no payouts, no trading.
          </p>
        </div>
        <div className="min-w-[260px] rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elev)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Pill className={market.open ? "bg-[var(--up-dim)] text-[var(--up)]" : "bg-[var(--amber-dim)] text-[var(--amber)]"}>
              {market.label}
            </Pill>
            <span className="text-[11px] text-[var(--muted)]">Base · 8453</span>
          </div>
          <div className="mt-2 num text-xs text-[var(--text)]">{market.nowWat}</div>
          <div className="num text-xs text-[var(--muted)]">{market.nowEt}</div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{market.reason}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "With official NAV", value: String(snapshot.navTokenCount) },
          { label: "Listed on the API", value: String(snapshot.listedTokenCount) },
          { label: "Minted (supply > 0)", value: String(snapshot.mintedTokenCount) },
          { label: "Widest gap", value: formatPct(widest || undefined) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[var(--line)] bg-[var(--bg-row)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{stat.label}</div>
            <div className="mt-1 num text-xl text-white">{stat.value}</div>
          </div>
        ))}
      </section>

      <UsageStats stats={stats} />

      {agent ? (
        <AgentDesk state={agent} tickers={rows.map((r) => r.symbol)} />
      ) : (
        <div className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">Agent is offline right now.</div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-[var(--amber)]/30 bg-[var(--amber-dim)] px-4 py-3 text-sm text-[var(--amber)]">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-sm font-medium text-white">NAV vs DEX premium</h2>
          <p className="text-[11px] text-[var(--muted)]">
            Sorted by absolute gap · prices from Aerodrome USDC pools on Base
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Ticker</th>
                <th className="px-4 py-2 text-right font-medium">NAV</th>
                <th className="px-4 py-2 text-right font-medium">DEX / after-hours</th>
                <th className="px-4 py-2 text-right font-medium">Premium</th>
                <th className="px-4 py-2 text-right font-medium">Liq / vol</th>
                <th className="px-4 py-2 text-right font-medium">Feed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.symbol} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {otherMinted.length > 0 && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-row)] px-4 py-4">
          <h2 className="text-sm font-medium text-white">Minted, no official NAV yet</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The Tokenized Stocks API listed {snapshot.listedTokenCount} records. Only {snapshot.navTokenCount} currently
            publish <span className="num">nav_price</span>. These have supply onchain but no reference value, so a
            premium cannot be computed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {otherMinted.slice(0, 24).map((row) => (
              <span key={row.symbol} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]">
                {row.symbol}
              </span>
            ))}
            {otherMinted.length > 24 && (
              <span className="rounded-full px-2.5 py-1 text-xs text-[var(--muted)]">
                +{otherMinted.length - 24} more
              </span>
            )}
          </div>
        </section>
      )}

      <footer className="rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-4 text-xs leading-5 text-[var(--muted)]">
        <p className="font-medium uppercase tracking-[0.16em] text-[var(--amber)]">Disclaimer</p>
        <p className="mt-2">
          Informational only. Not investment advice, not an offer or solicitation to buy or sell any security,
          and not a trading venue. AfterHours does not execute trades, hold funds, or pay out on gap calls.
          Coinbase tokenized stocks are available only to persons in eligible jurisdictions outside the United
          States. Official NAV is a Chainlink-based reference value, not a live bid/ask. DEX prices can be thin
          and can diverge from NAV, especially after hours. A premium or discount is not a prediction and does
          not grant any rights in the underlying public company.
        </p>
        <p className="mt-2 num text-[10px]">
          Snapshot {new Date(snapshot.fetchedAt).toISOString()} · sources: api.coinbase.com/v1/tokenized-stocks,
          Base public RPC (pool slot0), DexScreener (liquidity), AfterHoursBoard events on Base Sepolia.
        </p>
      </footer>
    </div>
  );
}
