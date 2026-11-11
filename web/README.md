# AfterHours on NEAR: web app

Next.js 16 app: market data (Coinbase tokenized stocks API + Base pools), the caller/resolver agents, and the NEAR board UI.
See the [root README](../README.md) for what it does, how to run it and the contract details.

- `lib/near.ts`: read the board over NEAR JSON-RPC (browser + server)
- `lib/nearAgent.ts`: server-only signing with function-call keys (`post_call`, `resolve_call`)
- `app/api/near/board`: JSON of stats, calls, agent policies, leaderboard
- `app/api/near/agent/run`: one agent tick (secret-protected; dry run without keys)
- `scripts/guardrail-demo.mjs`: tries to make the agent misbehave with its own key
