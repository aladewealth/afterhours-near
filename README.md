# AfterHours on NEAR: a trading-call agent that can't go rogue

**Live demo:** https://afterhours-near.netlify.app (NEAR testnet, read-only hosted copy)
**Board contract:** [`board.afterhours-near.testnet`](https://testnet.nearblocks.io/address/board.afterhours-near.testnet)
**Built at NEAR HACKATHON (Build Beyond Boundaries), Nov 2026.** Tracks: AI Security & Defense, Agent Economy, Unstoppable DeFi.

## The problem

AI agents are starting to publish market calls and act on markets. Two questions decide whether anyone should trust one:

1. **What stops it?** If the server or prompt is compromised, can the agent spam, wander outside its mandate, or drain the wallet it signs with?
2. **Is it any good?** Agent track records are screenshots and claims. Nothing stops an agent (or its owner) from deleting the misses.

## What this is

AfterHours watches Coinbase tokenized stocks (AAPLc, NVDAc, TSLAc…), which keep trading on Base DEX pools after Wall Street closes while the official NAV is frozen. The caller agent reads the gap between NAV and the onchain pool price and posts a short reasoned call ("gap up at the next open", "gap down", or "converge") to a **NEAR smart contract**.

NEAR is what makes the agent safe and accountable:

| Guardrail | How NEAR enforces it |
| --- | --- |
| The agent's key can do exactly one thing | `agent.afterhours-near.testnet` holds a single **function-call access key** limited to `post_call` on the board, with a 0.3 NEAR gas allowance. It cannot transfer NEAR, add keys, deploy code or call any other method. Its full-access key was deleted. |
| A human sets the mandate | The board stores an `AgentPolicy` per agent: daily call budget, minimum confidence, ticker allow-list, expiry date, on/off switch. Only the owner account `afterhours-near.testnet` can change it. |
| Violations are public, not silent | A call that breaks the policy is **not posted**, but the attempt is stored and emitted as a `call_blocked` event with the reason. |
| The track record can't be faked | A second agent, `resolver.afterhours-near.testnet` (its own key, limited to `resolve_call`), grades each call against the official NAV after the next open. The contract refuses self-grading and double-grading and keeps a hit-rate per author. |
| People can compete with the agent | Anyone with a NEAR testnet wallet can post their own call from the site (wallet selector: MyNearWallet, Meteor). Humans and the agent share one leaderboard. |
| Global kill switch | `set_paused(true)` from the owner stops every post and grade. `pause_agent` switches off one agent. |

Informational only: no custody, no trading, no payouts.

## Try it (judges: do X, see Y)

1. **Open the live demo** https://afterhours-near.netlify.app. See the caller agent's current read of every tokenized stock, the NEAR board feed, the **Guardrails** panel (live policy read from the contract) and the **Track record** table.
2. **Read the contract directly** (no wallet needed):
   ```bash
   near contract call-function as-read-only board.afterhours-near.testnet get_stats json-args {} network-config testnet now
   near contract call-function as-read-only board.afterhours-near.testnet get_agents json-args {} network-config testnet now
   near contract call-function as-read-only board.afterhours-near.testnet get_calls json-args '{"limit":10}' network-config testnet now
   ```
   Or `curl https://afterhours-near.netlify.app/api/near/board`.
3. **Check the agent's keys:** `near account list-keys agent.afterhours-near.testnet network-config testnet now` shows one key: `only do ["post_call"] function calls on board.afterhours-near.testnet`.
4. **See the guardrails fire.** These transactions were sent with the agent's own key by `web/scripts/guardrail-demo.mjs`:
   - ticker not on the allow-list → [`blocked`](https://testnet.nearblocks.io/txns/2YhuBom5bFCfAnZo4iKKbMaDedZiDMuWU9fLpx2RvuAY): `"DOGEc is not on the agent's allow-list"`
   - confidence under the minimum → [`blocked`](https://testnet.nearblocks.io/txns/ACfoWZ4bg8uDQ7YYwzbJiMEAjtLAAJsrx2iWmkNDxUFo): `"confidence 10 under policy minimum 35"`
   - agent tries to raise its own budget with `set_agent_policy` → rejected: `Access key does not allow method set_agent_policy`
   - agent tries to move 0.1 NEAR → rejected: `Access key requires full access`
5. **Post your own call:** on the site, *Take the other side of the agent* → *Connect NEAR wallet* (testnet) → pick a ticker and direction → *Post call on NEAR*. It appears in the feed and on the leaderboard and is graded the same way as the agent's.
6. **Run it yourself:** see *Run locally* below. `cargo test` in `contract/` runs 8 unit tests covering every guardrail.

## Architecture

```
 Coinbase Tokenized Stocks API ──► official NAV ─┐
 Base mainnet Aerodrome pools (slot0) ──► DEX ───┤
                                                  ▼
                             web/lib/agent.ts  rule engine (+ optional NEAR AI Cloud note)
                                                  │  every 30 min (scripts/near-agent-loop.sh → /api/near/agent/run)
                       function-call key          ▼
 agent.afterhours-near.testnet ── post_call ──► board.afterhours-near.testnet (Rust, near-sdk 5)
                                                  │  checks AgentPolicy → Posted | Blocked (+ call_blocked event)
 resolver.afterhours-near.testnet ─ resolve_call ─┘  grades vs next official NAV, no self-grading → hit-rate
 afterhours-near.testnet (owner, human) ── set_agent_policy / pause_agent / set_paused
                                                  │
 Next.js site (Netlify) ◄── JSON-RPC view calls ──┘   + wallet selector for human calls
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Contract API (`contract/src/lib.rs`)

| Method | Who | What |
| --- | --- | --- |
| `new(owner)` | deployer, once | init |
| `set_agent_policy(agent, policy)` / `pause_agent(agent)` / `remove_agent(agent)` / `set_paused(paused)` / `transfer_ownership(new_owner)` | owner | the human's controls |
| `post_call(ticker, direction, confidence, note, ref_nav_e6?, ref_dex_e6?) -> Posted{id} \| Blocked{reason}` | anyone; agents are policy-checked; humans max 10/day | post a call |
| `resolve_call(id, open_price_e6) -> Resolution` | owner or agent with `can_resolve`; never the author | grade a call; ±0.10% around the reference NAV counts as flat |
| `get_stats`, `get_calls(before?, limit?)`, `get_call(id)`, `get_agents`, `get_leaderboard(limit?)` | view | read everything |

Events (NEP-297 style, `standard: "afterhours"`): `policy_set`, `agent_paused`, `agent_removed`, `board_paused`, `call_posted`, `call_blocked`, `call_resolved`.

## Deployed (NEAR testnet)

| Account | Role | Keys |
| --- | --- | --- |
| `afterhours-near.testnet` | owner (human): sets policy | full access, kept offline |
| `board.afterhours-near.testnet` | the contract | |
| `agent.afterhours-near.testnet` | caller agent | one function-call key: `post_call` only, 0.3 NEAR allowance |
| `resolver.afterhours-near.testnet` | resolver agent | one function-call key: `resolve_call` only, 0.2 NEAR allowance |

Current agent policy: 8 calls per UTC day, minimum confidence 35, 12-ticker allow-list (the stocks with an official NAV), expires 31 Dec 2026.

## Run locally

```bash
# contract
cd contract && cargo test && cargo near build non-reproducible-wasm

# web (Node 20+)
cd web && npm ci
cp .env.example .env.local   # fill in the function-call keys if you want the agents to sign; leave empty for read-only
npm run build && npx next start -p 3001
open http://localhost:3001

# one agent tick (needs keys + AGENT_RUN_SECRET)
curl -X POST localhost:3001/api/near/agent/run -H "x-agent-secret: $AGENT_RUN_SECRET"
# guardrail demo with the agent's own key
node scripts/guardrail-demo.mjs
```

Deploy your own board: create a testnet account with the faucet (`near account create-account sponsor-by-faucet-service <name>.testnet …`), create `board.`, `agent.` and `resolver.` sub-accounts, deploy `contract/target/near/afterhours_board.wasm` with `new {"owner":"<name>.testnet"}`, call `set_agent_policy` for both agents, add function-call keys and delete the agents' full-access keys. Point `NEAR_BOARD_CONTRACT` at your board.

Optional: set `NEAR_AI_API_KEY` to have the agent's notes written by a model on [NEAR AI Cloud](https://cloud.near.ai) (private inference in TEEs, OpenAI-compatible). The call decision always stays rule-based; any LLM failure falls back to the rule-based note.

## What was built during the hackathon (disclosure)

AfterHours started as a Base Sepolia app built earlier in November 2026 ([aladewealth/afterhours](https://github.com/aladewealth/afterhours)). That code is imported here as the **`baseline`** tag and is not part of the NEAR entry. Everything NEAR is new and lives after it: [`baseline...main`](https://github.com/aladewealth/afterhours-near/compare/baseline...main).

New for NEAR:
- `contract/`: the Rust board contract with onchain agent policy, blocked-attempt records, resolver role, no-self-grading and the leaderboard, plus unit tests.
- `web/lib/near.ts`, `web/lib/nearAgent.ts`: RPC reads, function-call-key signing for the caller and resolver agents, resolution rules.
- `web/app/api/near/*`, `web/components/{NearDesk,Guardrails,Leaderboard,NearCallComposer}.tsx`: the NEAR UI and wallet-selector posting.
- `web/scripts/guardrail-demo.mjs`, `scripts/near-agent-loop.sh`.
- NEAR AI Cloud as the default LLM endpoint for notes.

Reused from the baseline (unchanged or lightly edited): market data (`web/lib/{snapshot,coinbase,dex,market,pools}.ts`), the rule engine (`web/lib/agent.ts`), page styling.

Libraries: near-sdk 5 (Rust), near-api-js 7, @near-wallet-selector 10, Next.js 16, viem (Base reads), Tailwind 4. Parts of the code were written with AI coding assistance.

## Limits and trust assumptions

- Testnet only. NEAR Intents has no testnet, so cross-chain settlement is out of scope; nothing here moves money.
- The resolver is an agent run by the same operator. It is separated by key and contract rules (no self-grading, one grade per call, public reference prices), not by an independent oracle. A Chainlink or multi-resolver quorum is the next step.
- The NAV and DEX prices come from Coinbase's API and Base pools; the contract records the reference prices the agent used so each grade can be re-checked.
- Not investment advice. No custody, no trading, no payouts.

## License

MIT, see [LICENSE](LICENSE).
