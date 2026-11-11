# NEAR HACKATHON submission (draft, NOT sent)

Deadline: **14 Nov 2026 23:59 UTC = 15 Nov 2026 00:59 WAT**. One submission per project; no edits after sending (changes go through https://nearhackathon.com/request-changes).
Send via the form at https://nearhackathon.com/#apply or `POST https://nearhackathon.com/api/applications` only after Builds confirms every value.

| Field | Value | Status |
| --- | --- | --- |
| projectName (2-80) | `AfterHours on NEAR` | proposed |
| leadName (2-80) | Builds must confirm (legal name "Alade Akpoesiri Wealth" or "Builds Alade") | **needs Builds** |
| email (≤160) | Builds must confirm (aladebuilds@gmail.com?) | **needs Builds** |
| size | `1` | proposed |
| tracks | `["security","agents","defi"]` | proposed |
| nearAddress (mainnet payout) | Builds creates a mainnet NEAR account in a wallet (named `xxx.near` or 64-char implicit). The agent must not create it. | **needs Builds** |
| projectUrl | `https://github.com/aladewealth/afterhours-near` | ready once public |
| demoUrl | link to Builds' X post (see X_POST.md) | **needs the post** |
| idea (20-2000) | see below | proposed |
| consent | must be read verbatim: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." | **needs Builds** |

## idea (≈1,150 characters)

AI agents are starting to publish market calls, but nobody can check what stops a compromised agent or whether its track record is real. AfterHours on NEAR is a trading-call agent that can't go rogue. It watches Coinbase tokenized stocks that keep trading on Base after Wall Street closes, reads the gap between the frozen official NAV and the live pool price, and posts a reasoned gap call to a NEAR contract. NEAR does the trust work: the agent's account holds a single function-call access key that can only call post_call on the board (it cannot move NEAR or add keys); a human owner sets an onchain policy (daily budget, confidence floor, ticker allow-list, expiry, off switch); calls that break the policy are not posted but recorded as public call_blocked events; and a separate resolver agent with its own resolve_call-only key grades every call against the next official NAV, with self-grading refused by the contract, so each author's hit-rate is verifiable. People can post their own calls with a NEAR wallet and compete with the agent on the same leaderboard. Rust contract on testnet, live demo, MIT. Informational only: no custody, trading or payouts.

## JSON payload template (fill the blanks, print, get a yes, then send once)

```json
{
  "requestId": "<uuid generated once, reuse on retry>",
  "projectName": "AfterHours on NEAR",
  "leadName": "<Builds>",
  "email": "<Builds>",
  "size": "1",
  "tracks": ["security", "agents", "defi"],
  "nearAddress": "<Builds' mainnet account>",
  "projectUrl": "https://github.com/aladewealth/afterhours-near",
  "demoUrl": "<x.com/still404_/status/...>",
  "idea": "<idea text above>",
  "consent": true
}
```
Do not add any other field (`website` is a spam trap).
