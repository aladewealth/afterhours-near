import { NEAR_EXPLORER, NEAR_OWNER_ACCOUNT, type NearBoard } from "@/lib/near";

function fmtDate(ms: number) {
  if (!ms) return "never";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(ms)) + " UTC";
}

const KEY_SCOPE: Record<string, string> = {
  post_call: "can only call post_call on the board",
  resolve_call: "can only call resolve_call on the board",
};

/** The policy each agent runs under, read live from the contract, plus what its signing key is allowed to do. */
export function Guardrails({ board }: { board: NearBoard }) {
  const today = Math.floor(Date.now() / 86_400_000);
  return (
    <section id="guardrails" className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-row)] px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white">Guardrails · set by a human, enforced onchain</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">
            Only the owner account <a className="num text-[var(--text)] hover:text-[var(--amber)]" href={`${NEAR_EXPLORER}/address/${NEAR_OWNER_ACCOUNT}`} target="_blank" rel="noreferrer">{NEAR_OWNER_ACCOUNT}</a> can change these.
            Each agent account holds a single NEAR function-call access key: it cannot transfer NEAR, add keys or call any other method.
            A call that breaks the policy is not posted; the attempt is recorded and emitted as a <span className="num">call_blocked</span> event.
          </p>
        </div>
        <a href="/api/near/board" className="num text-[11px] text-[var(--amber)] hover:underline">
          JSON /api/near/board
        </a>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {board.agents.map((a) => {
          const used = a.usage.day === today ? a.usage.calls_today : 0;
          const role = a.policy.can_post ? "post_call" : "resolve_call";
          return (
            <div key={a.account_id} className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <a className="num font-medium text-white hover:text-[var(--amber)]" href={`${NEAR_EXPLORER}/address/${a.account_id}`} target="_blank" rel="noreferrer">
                  {a.account_id}
                </a>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.policy.active ? "bg-[var(--up-dim)] text-[var(--up)]" : "bg-[var(--down-dim)] text-[var(--down)]"}`}>
                  {a.policy.active ? "active" : "switched off"}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[var(--muted)]">
                <dt>Role</dt>
                <dd className="text-[var(--text)]">{a.policy.can_post ? "caller" : ""}{a.policy.can_post && a.policy.can_resolve ? " + " : ""}{a.policy.can_resolve ? "resolver" : ""}</dd>
                {a.policy.can_post && (
                  <>
                    <dt>Daily budget</dt>
                    <dd className="num text-[var(--text)]">{used} / {a.policy.max_calls_per_day} today</dd>
                    <dt>Min confidence</dt>
                    <dd className="num text-[var(--text)]">{a.policy.min_confidence}</dd>
                    <dt>Allow-list</dt>
                    <dd className="text-[var(--text)]">{a.policy.allowed_tickers.length ? `${a.policy.allowed_tickers.length} tickers` : "any ticker"}</dd>
                  </>
                )}
                <dt>Expires</dt>
                <dd className="text-[var(--text)]">{fmtDate(a.policy.expires_at_ms)}</dd>
                <dt>Signing key</dt>
                <dd className="text-[var(--text)]">function-call key, {KEY_SCOPE[role]}</dd>
                <dt>Blocked attempts</dt>
                <dd className="num text-[var(--text)]">{a.usage.blocked_total}</dd>
              </dl>
              {a.usage.last_blocked_reason && (
                <p className="mt-2 rounded-lg bg-[var(--amber-dim)] px-2 py-1 text-[11px] text-[var(--amber)]">Last block: {a.usage.last_blocked_reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
