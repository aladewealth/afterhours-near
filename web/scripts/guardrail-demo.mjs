#!/usr/bin/env node
// Guardrail demo: try to make the AfterHours agent misbehave with its own key and show what stops it.
// Usage (from web/): node scripts/guardrail-demo.mjs   — reads NEAR_AGENT_KEY etc. from .env.local
import { Account, nearToYocto } from "near-api-js";

try { process.loadEnvFile(".env.local"); } catch { /* use the real environment */ }
const RPC = process.env.NEAR_RPC || "https://rpc.testnet.near.org";
const BOARD = process.env.NEAR_BOARD_CONTRACT || "board.afterhours-near.testnet";
const AGENT = process.env.NEAR_AGENT_ACCOUNT || "agent.afterhours-near.testnet";
const KEY = process.env.NEAR_AGENT_KEY;
if (!KEY) { console.error("NEAR_AGENT_KEY is not set"); process.exit(1); }
const EXPLORER = "https://testnet.nearblocks.io/txns/";
const agent = new Account(AGENT, RPC, KEY);

function outcome(r) {
  const s = r.status;
  if (s?.SuccessValue) return JSON.parse(Buffer.from(s.SuccessValue, "base64").toString());
  if (s?.Failure) return { failure: s.Failure };
  return s;
}

async function attempt(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    const r = await fn();
    const hash = r?.transaction?.hash;
    console.log("  result:", JSON.stringify(outcome(r)));
    if (hash) console.log("  tx:", EXPLORER + hash);
  } catch (err) {
    console.log("  rejected before execution:", (err?.message || String(err)).split("\n")[0].slice(0, 200));
  }
}

const call = (args) => agent.callFunctionRaw({ contractId: BOARD, methodName: "post_call", args, gas: 30_000_000_000_000n, waitUntil: "FINAL" });

await attempt("1. Post a call on a ticker that is not on the owner's allow-list (DOGEc)", () =>
  call({ ticker: "DOGEc", direction: 1, confidence: 80, note: "guardrail demo: not on allow-list" }));
await attempt("2. Post a call with confidence 10, under the policy minimum", () =>
  call({ ticker: "AAPLc", direction: 1, confidence: 10, note: "guardrail demo: low confidence" }));
await attempt("3. Raise its own daily budget by calling set_agent_policy", () =>
  agent.callFunctionRaw({
    contractId: BOARD,
    methodName: "set_agent_policy",
    args: { agent: AGENT, policy: { can_post: true, can_resolve: true, max_calls_per_day: 1000, min_confidence: 0, allowed_tickers: [], active: true, expires_at_ms: 0 } },
    gas: 30_000_000_000_000n,
    waitUntil: "FINAL",
  }));
await attempt("4. Move 0.1 NEAR out of the agent account", () => agent.transfer({ receiverId: "afterhours-near.testnet", amount: nearToYocto("0.1") }));
console.log("\nRead the recorded blocks: near contract call-function as-read-only", BOARD, "get_agents json-args {} network-config testnet now");
