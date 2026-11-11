//! AfterHours Board on NEAR.
//!
//! A public board where an AI agent (and people) post informational "gap calls" on tokenized stocks,
//! and where the agent is only allowed to act inside a policy that a human owner sets onchain:
//!
//! * per-agent daily call budget, minimum confidence, ticker allow-list, expiry and an off switch;
//! * calls that break the policy are not posted, but the attempt is recorded and emitted as a
//!   `call_blocked` event, so the guardrail itself is auditable;
//! * a separate resolver role grades calls after the next market open, and nobody can grade their own
//!   call, so every author (agent or human) builds a verifiable hit-rate.
//!
//! The agent signs with a NEAR function-call access key that can only call `post_call` /
//! `resolve_call` on this contract and has a small gas allowance; it cannot move funds.
//! No custody, no trading, no payouts.

use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

pub const MAX_TICKER_LEN: usize = 16;
pub const MAX_NOTE_LEN: usize = 280;
pub const HUMAN_DAILY_LIMIT: u32 = 10;
pub const DAY_MS: u64 = 86_400_000;
/// Moves smaller than this (in basis points of the reference NAV) count as "flat".
pub const FLAT_BAND_BPS: u64 = 10;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Calls,
    Agents,
    Authors,
    Usage,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct AgentPolicy {
    /// Agent may post calls.
    pub can_post: bool,
    /// Agent may grade other authors' calls.
    pub can_resolve: bool,
    /// Max calls per UTC day.
    pub max_calls_per_day: u32,
    /// Calls under this confidence (0-100) are blocked.
    pub min_confidence: u8,
    /// Empty = any ticker.
    pub allowed_tickers: Vec<String>,
    /// Off switch. Inactive agents are blocked from everything.
    pub active: bool,
    /// Unix ms after which the agent is blocked. 0 = never.
    pub expires_at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Usage {
    pub day: u64,
    pub calls_today: u32,
    pub blocked_total: u32,
    pub last_blocked_reason: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AuthorStats {
    pub calls: u32,
    pub resolved: u32,
    pub hits: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Resolution {
    /// Official price at the next open, 6 decimals.
    pub open_price_e6: u64,
    /// Realized direction vs the reference NAV: -1, 0, 1.
    pub realized: i8,
    pub hit: bool,
    pub resolved_by: AccountId,
    pub resolved_at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Call {
    pub id: u64,
    pub author: AccountId,
    pub by_agent: bool,
    pub ticker: String,
    /// -1 gap down, 0 flat / converge, 1 gap up.
    pub direction: i8,
    pub confidence: u8,
    pub note: String,
    /// Reference official NAV when the call was made, 6 decimals (0 = not given).
    pub ref_nav_e6: u64,
    /// Reference onchain DEX price when the call was made, 6 decimals (0 = not given).
    pub ref_dex_e6: u64,
    pub posted_at_ms: u64,
    pub resolution: Option<Resolution>,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PostOutcome {
    Posted { id: u64 },
    Blocked { reason: String },
}

#[near(serializers = [json])]
pub struct AgentView {
    pub account_id: AccountId,
    pub policy: AgentPolicy,
    pub usage: Usage,
    pub stats: AuthorStats,
}

#[near(serializers = [json])]
pub struct LeaderRow {
    pub account_id: AccountId,
    pub is_agent: bool,
    pub stats: AuthorStats,
    /// Hits per 10,000 resolved calls.
    pub hit_rate_bps: u32,
}

#[near(serializers = [json])]
pub struct BoardStats {
    pub owner: AccountId,
    pub paused: bool,
    pub total_calls: u64,
    pub agent_calls: u64,
    pub community_calls: u64,
    pub resolved_calls: u64,
    pub blocked_attempts: u64,
    pub authors: u32,
    pub agents: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Board {
    owner: AccountId,
    paused: bool,
    calls: Vector<Call>,
    agents: IterableMap<AccountId, AgentPolicy>,
    authors: IterableMap<AccountId, AuthorStats>,
    usage: LookupMap<AccountId, Usage>,
    agent_calls: u64,
    resolved_calls: u64,
    blocked_attempts: u64,
}

fn emit(event: &str, data: String) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"afterhours\",\"version\":\"1.0.0\",\"event\":\"{event}\",\"data\":[{data}]}}"
    ));
}

fn json_str(s: &str) -> String {
    near_sdk::serde_json::to_string(s).unwrap()
}

fn validate_ticker(ticker: &str) {
    require!(!ticker.is_empty(), "empty ticker");
    require!(ticker.len() <= MAX_TICKER_LEN, "ticker too long");
    require!(
        ticker.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-'),
        "ticker must be ascii letters, digits, '.' or '-'"
    );
}

#[near]
impl Board {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            paused: false,
            calls: Vector::new(Key::Calls),
            agents: IterableMap::new(Key::Agents),
            authors: IterableMap::new(Key::Authors),
            usage: LookupMap::new(Key::Usage),
            agent_calls: 0,
            resolved_calls: 0,
            blocked_attempts: 0,
        }
    }

    // ---------- owner: the human sets the constraints ----------

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only the owner");
    }

    pub fn set_agent_policy(&mut self, agent: AccountId, policy: AgentPolicy) {
        self.assert_owner();
        require!(policy.min_confidence <= 100, "min_confidence must be 0-100");
        for t in &policy.allowed_tickers {
            validate_ticker(t);
        }
        emit(
            "policy_set",
            format!(
                "{{\"agent\":{},\"can_post\":{},\"can_resolve\":{},\"max_calls_per_day\":{},\"min_confidence\":{},\"active\":{}}}",
                json_str(agent.as_str()),
                policy.can_post,
                policy.can_resolve,
                policy.max_calls_per_day,
                policy.min_confidence,
                policy.active
            ),
        );
        self.agents.insert(agent, policy);
    }

    /// Instant off switch for one agent.
    pub fn pause_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        let p = self.agents.get_mut(&agent).unwrap_or_else(|| env::panic_str("unknown agent"));
        p.active = false;
        emit("agent_paused", format!("{{\"agent\":{}}}", json_str(agent.as_str())));
    }

    pub fn remove_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        self.agents.remove(&agent);
        emit("agent_removed", format!("{{\"agent\":{}}}", json_str(agent.as_str())));
    }

    /// Global kill switch: blocks every post and resolution.
    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
        emit("board_paused", format!("{{\"paused\":{paused}}}"));
    }

    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        self.owner = new_owner;
    }

    // ---------- posting ----------

    fn record_block(&mut self, who: &AccountId, mut usage: Usage, reason: String) -> PostOutcome {
        usage.blocked_total += 1;
        usage.last_blocked_reason = Some(reason.clone());
        self.usage.insert(who.clone(), usage);
        self.blocked_attempts += 1;
        emit(
            "call_blocked",
            format!("{{\"agent\":{},\"reason\":{}}}", json_str(who.as_str()), json_str(&reason)),
        );
        PostOutcome::Blocked { reason }
    }

    /// Post an informational call. Registered agents are checked against their policy: a violation is
    /// recorded (not posted) and returned as `Blocked`. Malformed input from anyone panics.
    #[allow(clippy::too_many_arguments)]
    pub fn post_call(
        &mut self,
        ticker: String,
        direction: i8,
        confidence: u8,
        note: String,
        ref_nav_e6: Option<u64>,
        ref_dex_e6: Option<u64>,
    ) -> PostOutcome {
        require!(!self.paused, "board is paused");
        validate_ticker(&ticker);
        require!((-1..=1).contains(&direction), "direction must be -1, 0 or 1");
        require!(confidence <= 100, "confidence must be 0-100");
        require!(note.len() <= MAX_NOTE_LEN, "note too long");

        let who = env::predecessor_account_id();
        let now = env::block_timestamp_ms();
        let today = now / DAY_MS;
        let mut usage = self.usage.get(&who).cloned().unwrap_or_default();
        if usage.day != today {
            usage.day = today;
            usage.calls_today = 0;
        }

        let policy = self.agents.get(&who).cloned();
        let by_agent = policy.is_some();
        if let Some(p) = &policy {
            let reason = if !p.active {
                Some("agent is switched off".to_string())
            } else if p.expires_at_ms != 0 && now > p.expires_at_ms {
                Some("agent policy expired".to_string())
            } else if !p.can_post {
                Some("agent may not post calls".to_string())
            } else if usage.calls_today >= p.max_calls_per_day {
                Some(format!("daily budget used ({}/{})", usage.calls_today, p.max_calls_per_day))
            } else if confidence < p.min_confidence {
                Some(format!("confidence {} under policy minimum {}", confidence, p.min_confidence))
            } else if !p.allowed_tickers.is_empty() && !p.allowed_tickers.iter().any(|t| t == &ticker) {
                Some(format!("{ticker} is not on the agent's allow-list"))
            } else {
                None
            };
            if let Some(reason) = reason {
                return self.record_block(&who, usage, reason);
            }
        } else {
            require!(usage.calls_today < HUMAN_DAILY_LIMIT, "daily limit reached for this account");
        }

        usage.calls_today += 1;
        self.usage.insert(who.clone(), usage);

        let id = self.calls.len() as u64;
        let call = Call {
            id,
            author: who.clone(),
            by_agent,
            ticker: ticker.clone(),
            direction,
            confidence,
            note,
            ref_nav_e6: ref_nav_e6.unwrap_or(0),
            ref_dex_e6: ref_dex_e6.unwrap_or(0),
            posted_at_ms: now,
            resolution: None,
        };
        self.calls.push(call);
        if by_agent {
            self.agent_calls += 1;
        }
        let mut stats = self.authors.get(&who).cloned().unwrap_or_default();
        stats.calls += 1;
        self.authors.insert(who.clone(), stats);

        emit(
            "call_posted",
            format!(
                "{{\"id\":{id},\"author\":{},\"by_agent\":{by_agent},\"ticker\":{},\"direction\":{direction},\"confidence\":{confidence}}}",
                json_str(who.as_str()),
                json_str(&ticker)
            ),
        );
        PostOutcome::Posted { id }
    }

    /// Grade a call with the official price at the next open. Only the owner or an agent with
    /// `can_resolve` may grade, never their own call, and only once.
    pub fn resolve_call(&mut self, id: u64, open_price_e6: u64) -> Resolution {
        require!(!self.paused, "board is paused");
        let who = env::predecessor_account_id();
        if who != self.owner {
            let p = self.agents.get(&who).unwrap_or_else(|| env::panic_str("not a resolver"));
            require!(p.active && p.can_resolve, "agent may not resolve calls");
            require!(p.expires_at_ms == 0 || env::block_timestamp_ms() <= p.expires_at_ms, "agent policy expired");
        }
        require!(open_price_e6 > 0, "open price must be positive");
        let call = self.calls.get_mut(id as u32).unwrap_or_else(|| env::panic_str("unknown call"));
        require!(call.resolution.is_none(), "already resolved");
        require!(call.author != who, "cannot grade your own call");
        require!(call.ref_nav_e6 > 0, "call has no reference price");

        let r = call.ref_nav_e6 as u128;
        let o = open_price_e6 as u128;
        let diff = if o > r { o - r } else { r - o };
        let realized: i8 = if diff * 10_000 < r * FLAT_BAND_BPS as u128 {
            0
        } else if o > r {
            1
        } else {
            -1
        };
        let hit = realized == call.direction;
        let res = Resolution {
            open_price_e6,
            realized,
            hit,
            resolved_by: who.clone(),
            resolved_at_ms: env::block_timestamp_ms(),
        };
        call.resolution = Some(res.clone());
        let author = call.author.clone();
        let mut stats = self.authors.get(&author).cloned().unwrap_or_default();
        stats.resolved += 1;
        if hit {
            stats.hits += 1;
        }
        self.authors.insert(author.clone(), stats);
        self.resolved_calls += 1;
        emit(
            "call_resolved",
            format!(
                "{{\"id\":{id},\"author\":{},\"realized\":{realized},\"hit\":{hit},\"resolved_by\":{}}}",
                json_str(author.as_str()),
                json_str(who.as_str())
            ),
        );
        res
    }

    // ---------- views ----------

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_call(&self, id: u64) -> Option<Call> {
        self.calls.get(id as u32).cloned()
    }

    /// Newest first. `before` = exclusive upper id bound (default: latest).
    pub fn get_calls(&self, before: Option<u64>, limit: Option<u32>) -> Vec<Call> {
        let len = self.calls.len() as u64;
        let end = before.unwrap_or(len).min(len);
        let limit = limit.unwrap_or(50).min(100) as u64;
        let start = end.saturating_sub(limit);
        (start..end).rev().filter_map(|i| self.calls.get(i as u32).cloned()).collect()
    }

    pub fn get_agents(&self) -> Vec<AgentView> {
        self.agents
            .iter()
            .map(|(a, p)| AgentView {
                account_id: a.clone(),
                policy: p.clone(),
                usage: self.usage.get(a).cloned().unwrap_or_default(),
                stats: self.authors.get(a).cloned().unwrap_or_default(),
            })
            .collect()
    }

    pub fn get_leaderboard(&self, limit: Option<u32>) -> Vec<LeaderRow> {
        let mut rows: Vec<LeaderRow> = self
            .authors
            .iter()
            .map(|(a, s)| LeaderRow {
                account_id: a.clone(),
                is_agent: self.agents.contains_key(a),
                stats: s.clone(),
                hit_rate_bps: if s.resolved == 0 { 0 } else { s.hits * 10_000 / s.resolved },
            })
            .collect();
        rows.sort_by(|x, y| {
            y.hit_rate_bps
                .cmp(&x.hit_rate_bps)
                .then(y.stats.resolved.cmp(&x.stats.resolved))
                .then(y.stats.calls.cmp(&x.stats.calls))
        });
        rows.truncate(limit.unwrap_or(20).min(100) as usize);
        rows
    }

    pub fn get_stats(&self) -> BoardStats {
        let total = self.calls.len() as u64;
        BoardStats {
            owner: self.owner.clone(),
            paused: self.paused,
            total_calls: total,
            agent_calls: self.agent_calls,
            community_calls: total - self.agent_calls,
            resolved_calls: self.resolved_calls,
            blocked_attempts: self.blocked_attempts,
            authors: self.authors.len(),
            agents: self.agents.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(who: &str, ts_ms: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(acc(who)).block_timestamp(ts_ms * 1_000_000);
        testing_env!(b.build());
    }

    fn policy() -> AgentPolicy {
        AgentPolicy {
            can_post: true,
            can_resolve: false,
            max_calls_per_day: 2,
            min_confidence: 50,
            allowed_tickers: vec!["AAPLc".into(), "TSLAc".into()],
            active: true,
            expires_at_ms: 0,
        }
    }

    fn setup() -> Board {
        ctx("owner.testnet", 1_000);
        let mut b = Board::new(acc("owner.testnet"));
        b.set_agent_policy(acc("agent.testnet"), policy());
        let mut r = policy();
        r.can_post = false;
        r.can_resolve = true;
        b.set_agent_policy(acc("resolver.testnet"), r);
        b
    }

    #[test]
    fn agent_posts_within_policy() {
        let mut b = setup();
        ctx("agent.testnet", 2_000);
        let out = b.post_call("AAPLc".into(), 1, 70, "gap up".into(), Some(200_000_000), Some(201_000_000));
        assert_eq!(out, PostOutcome::Posted { id: 0 });
        let c = b.get_call(0).unwrap();
        assert!(c.by_agent);
        assert_eq!(b.get_stats().agent_calls, 1);
    }

    #[test]
    fn policy_blocks_and_records() {
        let mut b = setup();
        ctx("agent.testnet", 2_000);
        assert!(matches!(b.post_call("NVDAc".into(), 1, 70, "".into(), None, None), PostOutcome::Blocked { .. }));
        assert!(matches!(b.post_call("AAPLc".into(), 1, 10, "".into(), None, None), PostOutcome::Blocked { .. }));
        b.post_call("AAPLc".into(), 1, 70, "".into(), None, None);
        b.post_call("TSLAc".into(), -1, 70, "".into(), None, None);
        let third = b.post_call("TSLAc".into(), 1, 70, "".into(), None, None);
        assert!(matches!(third, PostOutcome::Blocked { reason } if reason.contains("daily budget")));
        assert_eq!(b.get_stats().blocked_attempts, 3);
        assert_eq!(b.get_stats().total_calls, 2);
        // new day resets the budget
        ctx("agent.testnet", 2_000 + DAY_MS);
        assert!(matches!(b.post_call("TSLAc".into(), 1, 70, "".into(), None, None), PostOutcome::Posted { .. }));
    }

    #[test]
    fn off_switch_and_expiry() {
        let mut b = setup();
        ctx("owner.testnet", 3_000);
        b.pause_agent(acc("agent.testnet"));
        ctx("agent.testnet", 3_000);
        assert!(matches!(b.post_call("AAPLc".into(), 1, 70, "".into(), None, None), PostOutcome::Blocked { .. }));
        ctx("owner.testnet", 3_000);
        let mut p = policy();
        p.expires_at_ms = 5_000;
        b.set_agent_policy(acc("agent.testnet"), p);
        ctx("agent.testnet", 6_000);
        assert!(matches!(b.post_call("AAPLc".into(), 1, 70, "".into(), None, None), PostOutcome::Blocked { reason } if reason.contains("expired")));
    }

    #[test]
    #[should_panic(expected = "only the owner")]
    fn agent_cannot_change_its_policy() {
        let mut b = setup();
        ctx("agent.testnet", 2_000);
        let mut p = policy();
        p.max_calls_per_day = 1000;
        b.set_agent_policy(acc("agent.testnet"), p);
    }

    #[test]
    fn resolve_and_leaderboard() {
        let mut b = setup();
        ctx("agent.testnet", 2_000);
        b.post_call("AAPLc".into(), 1, 70, "".into(), Some(100_000_000), None);
        b.post_call("TSLAc".into(), -1, 70, "".into(), Some(100_000_000), None);
        ctx("alice.testnet", 2_000);
        b.post_call("AAPLc".into(), 0, 0, "".into(), Some(100_000_000), None);
        ctx("resolver.testnet", 9_000);
        assert!(b.resolve_call(0, 101_000_000).hit); // up 1% -> hit
        assert!(!b.resolve_call(1, 100_500_000).hit); // up 0.5% vs call down -> miss
        assert!(b.resolve_call(2, 100_050_000).hit); // +0.05% is inside flat band -> flat hit
        let lb = b.get_leaderboard(None);
        assert_eq!(lb[0].account_id, acc("alice.testnet"));
        assert_eq!(lb[0].hit_rate_bps, 10_000);
        assert_eq!(lb[1].hit_rate_bps, 5_000);
        assert!(lb[1].is_agent);
    }

    #[test]
    #[should_panic(expected = "cannot grade your own call")]
    fn no_self_grading() {
        let mut b = setup();
        ctx("owner.testnet", 2_000);
        b.post_call("AAPLc".into(), 1, 70, "".into(), Some(100_000_000), None);
        b.resolve_call(0, 101_000_000);
    }

    #[test]
    #[should_panic(expected = "agent may not resolve calls")]
    fn poster_cannot_resolve() {
        let mut b = setup();
        ctx("alice.testnet", 2_000);
        b.post_call("AAPLc".into(), 1, 70, "".into(), Some(100_000_000), None);
        ctx("agent.testnet", 3_000);
        b.resolve_call(0, 101_000_000);
    }

    #[test]
    fn human_daily_limit() {
        let mut b = setup();
        ctx("alice.testnet", 2_000);
        for _ in 0..HUMAN_DAILY_LIMIT {
            b.post_call("AAPLc".into(), 1, 50, "".into(), None, None);
        }
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            b.post_call("AAPLc".into(), 1, 50, "".into(), None, None);
        }));
        assert!(r.is_err());
    }
}
