import "server-only";
import { Account, type KeyPairString } from "near-api-js";
import type { AgentCall } from "./agent";
import type { Snapshot } from "./types";
import {
  NEAR_AGENT_ACCOUNT,
  NEAR_BOARD_CONTRACT,
  NEAR_RESOLVER_ACCOUNT,
  NEAR_RPC,
  invalidateNearCache,
  readNearBoard,
  toE6,
} from "./near";

/**
 * Server-side signer for the NEAR agent. It only ever holds NEAR *function-call access keys*:
 *  - NEAR_AGENT_KEY may call `post_call` on the board, nothing else, with a small gas allowance;
 *  - NEAR_RESOLVER_KEY may call `resolve_call` on the board, nothing else.
 * Neither key can transfer NEAR, add keys, deploy code or touch any other contract. What the agent
 * may post (daily budget, min confidence, ticker allow-list, expiry, off switch) is enforced by the
 * contract from a policy only the human owner account can change.
 */

export type NearPostResult = {
  ticker: string;
  direction: number;
  status: "posted" | "blocked" | "skipped" | "failed";
  callId?: number;
  txHash?: string;
  reason?: string;
};

export type NearResolveResult = { id: number; ticker: string; status: "resolved" | "failed"; hit?: boolean; txHash?: string; reason?: string };

export function nearAgentCanPost(): boolean {
  return Boolean(process.env.NEAR_AGENT_KEY);
}

function account(id: string, key?: string) {
  if (!key) throw new Error(`missing key for ${id}`);
  return new Account(id, NEAR_RPC, key as KeyPairString);
}

type TxResponse = {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
  status?: { SuccessValue?: string; Failure?: unknown } | string;
};

function txHashOf(r: TxResponse): string | undefined {
  return r.transaction?.hash || r.transaction_outcome?.id;
}

function returnValue<T>(r: TxResponse): T | undefined {
  const s = r.status;
  if (s && typeof s === "object" && "SuccessValue" in s && s.SuccessValue) {
    return JSON.parse(Buffer.from(s.SuccessValue, "base64").toString("utf8")) as T;
  }
  return undefined;
}

function failureText(r: TxResponse): string | undefined {
  const s = r.status;
  if (s && typeof s === "object" && "Failure" in s && s.Failure) return JSON.stringify(s.Failure).slice(0, 240);
  return undefined;
}

/** Post the top agent calls to the NEAR board. Dedupes same ticker+direction within 6h and respects the
 * agent's onchain daily budget (the contract would block anything over it anyway). */
export async function postAgentCallsNear(calls: AgentCall[], maxPosts = 2): Promise<NearPostResult[]> {
  if (!nearAgentCanPost()) return calls.map((c) => ({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: "read-only mode" }));
  const agent = account(NEAR_AGENT_ACCOUNT, process.env.NEAR_AGENT_KEY);
  const board = await readNearBoard(true);
  const me = board.agents.find((a) => a.account_id === NEAR_AGENT_ACCOUNT);
  const today = Math.floor(Date.now() / 86_400_000);
  let usedToday = me && me.usage.day === today ? me.usage.calls_today : 0;
  const budget = me?.policy.max_calls_per_day ?? 0;
  const sixHoursAgo = Date.now() - 6 * 3600_000;
  const results: NearPostResult[] = [];
  let posted = 0;
  for (const c of calls) {
    if (posted >= maxPosts) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: "per-run cap" });
      continue;
    }
    if (me && usedToday >= budget) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: `onchain daily budget used (${usedToday}/${budget})` });
      continue;
    }
    const dup = board.calls.find(
      (b) => b.author === NEAR_AGENT_ACCOUNT && b.ticker === c.ticker && b.direction === c.direction && b.posted_at_ms > sixHoursAgo,
    );
    if (dup) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: `already called #${dup.id}` });
      continue;
    }
    try {
      const r = (await agent.callFunctionRaw({
        contractId: NEAR_BOARD_CONTRACT,
        methodName: "post_call",
        args: {
          ticker: c.ticker,
          direction: c.direction,
          confidence: c.confidence,
          note: c.note,
          ref_nav_e6: toE6(c.navPrice),
          ref_dex_e6: toE6(c.dexPrice),
        },
        gas: BigInt(30_000_000_000_000),
        waitUntil: "FINAL",
      })) as unknown as TxResponse;
      const fail = failureText(r);
      const out = returnValue<{ status: "posted"; id: number } | { status: "blocked"; reason: string }>(r);
      if (fail) {
        results.push({ ticker: c.ticker, direction: c.direction, status: "failed", txHash: txHashOf(r), reason: fail });
      } else if (out?.status === "blocked") {
        results.push({ ticker: c.ticker, direction: c.direction, status: "blocked", txHash: txHashOf(r), reason: out.reason });
      } else {
        results.push({ ticker: c.ticker, direction: c.direction, status: "posted", txHash: txHashOf(r), callId: out && "id" in out ? out.id : undefined });
        posted += 1;
        usedToday += 1;
      }
    } catch (err) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "failed", reason: err instanceof Error ? err.message.split("\n")[0] : "tx failed" });
    }
  }
  invalidateNearCache();
  return results;
}

/**
 * Resolver agent: grade open calls against the official NAV once there is a fresh one.
 * A call is due when the cash session is open, the stock's NAV feed is live, the NAV was published
 * after the call and the call is at least 60 minutes old. The contract refuses self-grading.
 */
export async function resolveDueCallsNear(snapshot: Snapshot, maxResolves = 6): Promise<NearResolveResult[]> {
  if (!process.env.NEAR_RESOLVER_KEY || !snapshot.market.open) return [];
  const resolver = account(NEAR_RESOLVER_ACCOUNT, process.env.NEAR_RESOLVER_KEY);
  const board = await readNearBoard(true);
  const byTicker = new Map(snapshot.rows.map((r) => [r.symbol, r]));
  const due = board.calls
    .filter((c) => !c.resolution && c.ref_nav_e6 > 0 && c.author !== NEAR_RESOLVER_ACCOUNT)
    .filter((c) => Date.now() - c.posted_at_ms > 60 * 60_000)
    .filter((c) => {
      const row = byTicker.get(c.ticker);
      if (!row || row.navPrice === undefined || row.feedState !== "live" || !row.navUpdatedAt) return false;
      return Date.parse(row.navUpdatedAt) > c.posted_at_ms;
    })
    .sort((a, b) => a.id - b.id)
    .slice(0, maxResolves);
  const out: NearResolveResult[] = [];
  for (const c of due) {
    const price = toE6(byTicker.get(c.ticker)!.navPrice);
    try {
      const r = (await resolver.callFunctionRaw({
        contractId: NEAR_BOARD_CONTRACT,
        methodName: "resolve_call",
        args: { id: c.id, open_price_e6: price },
        gas: BigInt(30_000_000_000_000),
        waitUntil: "FINAL",
      })) as unknown as TxResponse;
      const fail = failureText(r);
      const res = returnValue<{ hit: boolean }>(r);
      out.push(fail ? { id: c.id, ticker: c.ticker, status: "failed", txHash: txHashOf(r), reason: fail } : { id: c.id, ticker: c.ticker, status: "resolved", hit: res?.hit, txHash: txHashOf(r) });
    } catch (err) {
      out.push({ id: c.id, ticker: c.ticker, status: "failed", reason: err instanceof Error ? err.message.split("\n")[0] : "tx failed" });
    }
  }
  invalidateNearCache();
  return out;
}
