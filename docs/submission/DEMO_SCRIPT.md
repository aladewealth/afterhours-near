# Demo video script (~90 seconds)

Record the screen (phone or laptop). Open https://afterhours-near.netlify.app and https://testnet.nearblocks.io in tabs. Start with the problem, show one complete moment, explain NEAR's role concretely.

1. **(0-10s) Problem.** "If an AI agent is posting market calls, two questions matter: what stops it if it's hacked, and is its track record real?"
2. **(10-25s) The product.** Scroll the top of the site: "AfterHours watches tokenized stocks that keep trading on Base after Wall Street closes. The agent reads the gap between the frozen official price and the live pool price and posts a call to a NEAR contract." Point at the agent's current read and the board feed.
3. **(25-50s) The guardrails (the key moment).** Scroll to *Guardrails*. "A human sets this policy onchain: 8 calls a day, minimum confidence 35, 12 allowed tickers, an expiry and an off switch." Open the blocked transaction link from the README (DOGEc): "Here the agent tried a ticker outside its mandate. The contract didn't post it, and it recorded the attempt publicly." Then show `near account list-keys agent.afterhours-near.testnet`: "And its key can only call post_call. It can't move money or change its own rules. When it tried, NEAR rejected the transaction."
4. **(50-70s) Track record.** Scroll to *Track record*: "A second agent with its own key grades every call against the next official price. The contract won't let anyone grade their own call, so the hit-rate can't be faked."
5. **(70-85s) Take the other side.** Click *Connect NEAR wallet*, post a call. "Anyone can post their own call with a NEAR wallet and compete with the agent on the same leaderboard."
6. **(85-90s) Close.** "AfterHours on NEAR, built at NEAR HACKATHON. Repo and demo link below. Which guardrail would you add next?"

Optional terminal shot instead of step 3's explorer: `node web/scripts/guardrail-demo.mjs` prints all four attempts and what stopped each.
