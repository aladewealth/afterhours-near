# Architecture

## Components

1. **Data** (`web/lib/snapshot.ts`, baseline): official NAV per tokenized stock from `api.coinbase.com/v1/tokenized-stocks`, live price from Aerodrome USDC pools on Base mainnet (`slot0`), liquidity/volume from DexScreener, US market session clock.
2. **Caller agent** (`web/lib/agent.ts` rules + `web/lib/nearAgent.ts` signer): skips thin pools (< $100k) and small gaps; after hours a DEX premium is read as the next-open gap (up/down), during the cash session as noise that should converge. Confidence 5-90. The note is rule-written, or written by a NEAR AI Cloud model if `NEAR_AI_API_KEY` is set. Before signing it dedupes (same ticker+direction within 6h) and respects the onchain daily budget it reads from `get_agents`; the contract re-checks everything.
3. **Board contract** (`contract/src/lib.rs`, Rust, near-sdk 5): stores calls, per-agent policy, per-account daily usage, blocked-attempt counters, author stats.
4. **Resolver agent** (`resolveDueCallsNear`): when the cash session is open, the stock's NAV feed is live, the NAV was published after the call, and the call is 60+ minutes old, it submits `resolve_call(id, nav)`. The contract computes the realized direction vs the call's reference NAV (±10 bps = flat), marks hit/miss, updates the author's hit-rate, and refuses self-grading and double-grading.
5. **Site** (`web/app/page.tsx`): server-renders the agent's current read and the board (via view calls), plus a client wallet-selector widget so people can post their own calls.

## Key and account layout

```
afterhours-near.testnet            owner (human). Full access. Only account that can call set_agent_policy / pause_agent / set_paused.
├── board.afterhours-near.testnet  contract
├── agent.afterhours-near.testnet  1 key: FunctionCall{receiver: board, methods: [post_call], allowance: 0.3 NEAR}
└── resolver.afterhours-near.testnet 1 key: FunctionCall{receiver: board, methods: [resolve_call], allowance: 0.2 NEAR}
```

Two layers of defense:
- **Protocol layer (access keys):** even if the server running the agent is fully compromised, the stolen key can only call one method on one contract and can only burn its small gas allowance. It cannot move the account's NEAR or add a new key.
- **Contract layer (policy):** within that one method, the contract enforces the human's mandate (budget, confidence floor, allow-list, expiry, on/off) and records every violation publicly.

## Where it runs

- Contract: NEAR testnet.
- Agents: `scripts/near-agent-loop.sh` on the operator's machine calls `POST /api/near/agent/run` every 30 minutes. Keys live in `web/.env.local` (gitignored).
- Public site: Netlify (`afterhours-near.netlify.app`), read-only, no keys configured.
