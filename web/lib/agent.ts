import type { Snapshot, StockRow } from "./types";

/**
 * AfterHours Agent — reads the NAV vs onchain-price gap for every tokenized stock with an official NAV,
 * decides whether there is a call worth making, and writes a short reasoned note (<= 280 chars) that
 * fits AfterHoursBoard.postCall. Rule-based by default (free, deterministic). If an OpenAI-compatible
 * LLM endpoint is configured via env, it only rewrites the note; the decision stays rule-based.
 */

export type Direction = -1 | 0 | 1;

export type AgentCall = {
  ticker: string;
  name: string;
  direction: Direction;
  confidence: number; // 0..100
  premiumPct: number;
  navPrice: number;
  dexPrice: number;
  liquidityUsd?: number;
  feedState: StockRow["feedState"];
  regime: "after-hours" | "cash-session";
  signals: string[];
  note: string;
  noteSource: "rules" | "llm";
};

export type AgentReport = {
  generatedAt: string;
  marketOpen: boolean;
  thresholdPct: number;
  scanned: number;
  calls: AgentCall[];
  skipped: { ticker: string; reason: string }[];
  llm: { enabled: boolean; model?: string; error?: string };
};

export const AGENT_LIMITS = {
  /** Minimum USD liquidity on the pool before a gap is trusted. */
  minLiquidityUsd: 100_000,
  /** Absolute premium (%) needed to call a direction. */
  thresholdOpenPct: 0.35,
  thresholdClosedPct: 0.15,
  maxNoteLength: 280,
} as const;

export function directionLabel(d: Direction): string {
  return d === 1 ? "Gap up" : d === -1 ? "Gap down" : "Converge";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmtPct(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function compactUsd(n?: number) {
  if (n === undefined) return "n/a";
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function truncateNote(note: string, max: number = AGENT_LIMITS.maxNoteLength): string {
  const clean = note.replace(/\s+/g, " ").trim();
  if (Buffer.byteLength(clean, "utf8") <= max) return clean;
  let out = clean;
  while (Buffer.byteLength(out + "…", "utf8") > max) out = out.slice(0, -1);
  return out.trimEnd() + "…";
}

/** Pure rules: no network, no keys. */
export function analyzeSnapshot(snapshot: Snapshot): AgentReport {
  const marketOpen = snapshot.market.open;
  const threshold = marketOpen ? AGENT_LIMITS.thresholdOpenPct : AGENT_LIMITS.thresholdClosedPct;
  const calls: AgentCall[] = [];
  const skipped: AgentReport["skipped"] = [];

  for (const row of snapshot.rows) {
    if (row.navPrice === undefined || !row.dex || row.premiumPct === undefined) {
      skipped.push({ ticker: row.symbol, reason: "no NAV or no DEX price" });
      continue;
    }
    const liq = row.dex.liquidityUsd;
    if (liq !== undefined && liq < AGENT_LIMITS.minLiquidityUsd) {
      skipped.push({ ticker: row.symbol, reason: `pool too thin (${compactUsd(liq)})` });
      continue;
    }
    const p = row.premiumPct;
    const abs = Math.abs(p);
    if (abs < threshold) {
      skipped.push({ ticker: row.symbol, reason: `gap ${fmtPct(p)} under ${threshold}% threshold` });
      continue;
    }

    const signals: string[] = [];
    let direction: Direction;
    let confidence = 40 + (abs - threshold) * 60; // bigger gap → more conviction
    const regime: AgentCall["regime"] = marketOpen ? "cash-session" : "after-hours";

    if (marketOpen) {
      // Cash session: NAV is fed live; a gap is mostly DEX lag/arb noise → expect convergence.
      direction = 0;
      signals.push("cash session open: NAV is live, gap likely to arb back");
      if (row.feedState === "aging" || row.feedState === "stale") {
        confidence -= 15;
        signals.push(`NAV feed ${row.feedState}`);
      }
    } else {
      // After hours / weekend: NAV is frozen, the DEX keeps trading → the DEX premium is a read on the next open.
      direction = p > 0 ? 1 : -1;
      signals.push("cash closed: NAV frozen, DEX still trading");
      if (row.feedState === "holding") confidence += 5;
    }

    if (liq !== undefined) {
      if (liq >= 1_000_000) {
        confidence += 10;
        signals.push(`deep pool ${compactUsd(liq)}`);
      } else {
        signals.push(`pool ${compactUsd(liq)}`);
      }
    }
    if (row.dex.source === "onchain") {
      confidence += 5;
      signals.push("price read from pool slot0");
    }
    const vol = row.dex.volume24hUsd;
    if (vol !== undefined && vol > 5_000_000) {
      confidence += 5;
      signals.push(`24h vol ${compactUsd(vol)}`);
    }
    confidence = Math.round(clamp(confidence, 5, 90));

    const dexPrice = row.dex.priceUsd;
    const note = truncateNote(
      marketOpen
        ? `${row.symbol}: DEX $${dexPrice.toFixed(2)} vs NAV $${row.navPrice.toFixed(2)} (${fmtPct(p)}). Cash session is open, so I expect the gap to close, not a move. Liq ${compactUsd(liq)}. Conf ${confidence}/100. Not advice.`
        : `${row.symbol}: DEX $${dexPrice.toFixed(2)} vs frozen NAV $${row.navPrice.toFixed(2)} (${fmtPct(p)}). After-hours buyers are pricing a ${p > 0 ? "gap up" : "gap down"} at the next open. Liq ${compactUsd(liq)}. Conf ${confidence}/100. Not advice.`,
    );

    calls.push({
      ticker: row.symbol,
      name: row.name,
      direction,
      confidence,
      premiumPct: p,
      navPrice: row.navPrice,
      dexPrice,
      liquidityUsd: liq,
      feedState: row.feedState,
      regime,
      signals,
      note,
      noteSource: "rules",
    });
  }

  calls.sort((a, b) => b.confidence - a.confidence || Math.abs(b.premiumPct) - Math.abs(a.premiumPct));
  return {
    generatedAt: new Date().toISOString(),
    marketOpen,
    thresholdPct: threshold,
    scanned: snapshot.rows.length,
    calls,
    skipped,
    llm: { enabled: false },
  };
}

/**
 * Optional: rewrite each note with an OpenAI-compatible chat endpoint (OpenAI, OpenRouter free models,
 * Groq free tier, a local Ollama…). Configure AGENT_LLM_API_KEY (+ optional AGENT_LLM_BASE_URL,
 * AGENT_LLM_MODEL). Any failure falls back to the rule-based note.
 */
export async function maybeEnhanceWithLlm(report: AgentReport): Promise<AgentReport> {
  // NEAR AI Cloud (private inference in TEEs, OpenAI-compatible) is the default when NEAR_AI_API_KEY is set.
  const nearKey = process.env.NEAR_AI_API_KEY;
  const key = nearKey || process.env.AGENT_LLM_API_KEY;
  if (!key || report.calls.length === 0) return report;
  const base = (process.env.AGENT_LLM_BASE_URL || (nearKey ? "https://cloud-api.near.ai/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
  const model = process.env.AGENT_LLM_MODEL || (nearKey ? "zai-org/GLM-5.1-FP8" : "gpt-4o-mini");
  const out: AgentReport = { ...report, llm: { enabled: true, model } };
  try {
    const calls = await Promise.all(
      report.calls.slice(0, 5).map(async (c) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), nearKey ? 20000 : 8000);
        try {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            signal: ctrl.signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              temperature: 0.3,
              max_tokens: nearKey ? 800 : 120,
              messages: [
                {
                  role: "system",
                  content:
                    "You are AfterHours, an onchain analyst for Coinbase tokenized stocks (priced on Base, calls recorded on NEAR). Write ONE plain-text note under 240 characters explaining the call. Keep the numbers exactly as given. No hype, no emojis, end with 'Not advice.'",
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    ticker: c.ticker,
                    call: directionLabel(c.direction),
                    regime: c.regime,
                    premiumPct: Number(c.premiumPct.toFixed(3)),
                    nav: c.navPrice,
                    dex: c.dexPrice,
                    confidence: c.confidence,
                    signals: c.signals,
                  }),
                },
              ],
            }),
          });
          if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const text = data.choices?.[0]?.message?.content?.trim();
          if (!text) throw new Error("empty LLM reply");
          return { ...c, note: truncateNote(text), noteSource: "llm" as const };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    out.calls = [...calls, ...report.calls.slice(5)];
  } catch (err) {
    out.llm.error = err instanceof Error ? err.message : "LLM failed";
    out.calls = report.calls;
  }
  return out;
}
