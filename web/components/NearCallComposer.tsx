"use client";

import { useEffect, useRef, useState } from "react";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";

type Status = { kind: "idle" | "busy" | "ok" | "err"; text?: string; hash?: string };

const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet") as "testnet" | "mainnet";
const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

/** Post your own call to the NEAR board with any NEAR wallet (MyNearWallet, Meteor). Testnet, no money at stake. */
export function NearCallComposer({ contract, tickers }: { contract: string; tickers: string[] }) {
  const [ticker, setTicker] = useState(tickers[0] ?? "AAPLc");
  const [direction, setDirection] = useState<-1 | 0 | 1>(1);
  const [confidence, setConfidence] = useState(60);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [accountId, setAccountId] = useState<string | null>(null);
  const selectorRef = useRef<WalletSelector | null>(null);
  const modalRef = useRef<WalletSelectorModal | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/modal-ui"),
        import("@near-wallet-selector/my-near-wallet"),
        import("@near-wallet-selector/meteor-wallet"),
      ]);
      const selector = await setupWalletSelector({ network: NETWORK, modules: [setupMyNearWallet(), setupMeteorWallet()] });
      if (cancelled) return;
      selectorRef.current = selector;
      modalRef.current = setupModal(selector, { contractId: contract, description: "Post gap calls to the AfterHours board on NEAR testnet." } as never);
      const sync = () => {
        const acc = selector.store.getState().accounts.find((a) => a.active) ?? selector.store.getState().accounts[0];
        setAccountId(acc?.accountId ?? null);
      };
      sync();
      const sub = selector.store.observable.subscribe(sync);
      unsubscribe = () => sub.unsubscribe();
    })().catch((e) => setStatus({ kind: "err", text: `Wallet selector failed to load: ${e instanceof Error ? e.message : e}` }));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [contract]);

  async function post() {
    const selector = selectorRef.current;
    if (!selector) return;
    if (!accountId) {
      modalRef.current?.show();
      return;
    }
    try {
      setStatus({ kind: "busy", text: "Confirm in your NEAR wallet…" });
      const { actionCreators } = await import("@near-js/transactions");
      const wallet = await selector.wallet();
      const res = await wallet.signAndSendTransaction({
        receiverId: contract,
        actions: [
          actionCreators.functionCall(
            "post_call",
            { ticker, direction, confidence, note: note.slice(0, 280), ref_nav_e6: null, ref_dex_e6: null },
            BigInt(30_000_000_000_000),
            BigInt(0),
          ),
        ] as never,
      });
      const hash = (res as { transaction?: { hash?: string } } | void)?.transaction?.hash;
      setStatus({ kind: "ok", text: "Call posted to NEAR. Refresh to see it in the feed.", hash });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message.split("\n")[0] : "Transaction failed" });
    }
  }

  async function signOut() {
    const w = await selectorRef.current?.wallet();
    await w?.signOut();
    setAccountId(null);
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-row)] px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white">Take the other side of the agent</h3>
        {accountId ? (
          <button type="button" onClick={signOut} className="num text-[11px] text-[var(--muted)] hover:text-[var(--amber)]">
            {accountId} · sign out
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Post your own call with a NEAR testnet wallet. Free, no money at stake. The resolver agent grades it at the next open, same as the agent&apos;s.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={ticker} onChange={(e) => setTicker(e.target.value)} className="rounded-lg border border-[var(--line-strong)] bg-black/30 px-2 py-1.5 text-sm text-white">
          {tickers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {([1, 0, -1] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs ${direction === d ? "border-[var(--amber)] text-[var(--amber)]" : "border-[var(--line-strong)] text-[var(--muted)]"}`}
          >
            {d === 1 ? "Gap up" : d === -1 ? "Gap down" : "Flat"}
          </button>
        ))}
        <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          Conf
          <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
          <span className="num w-6 text-white">{confidence}</span>
        </label>
      </div>
      <input
        value={note}
        maxLength={280}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why? (optional, 280 chars)"
        className="mt-2 w-full rounded-lg border border-[var(--line-strong)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-[var(--muted)]"
      />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={status.kind === "busy"} onClick={post} className="rounded-lg bg-[var(--amber)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
          {accountId ? "Post call on NEAR" : "Connect NEAR wallet"}
        </button>
      </div>
      {status.kind !== "idle" && (
        <p className={`mt-2 text-xs ${status.kind === "err" ? "text-[var(--down)]" : status.kind === "ok" ? "text-[var(--up)]" : "text-[var(--muted)]"}`}>
          {status.text}{" "}
          {status.hash && (
            <a className="underline" href={`${EXPLORER}/txns/${status.hash}`} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </p>
      )}
    </div>
  );
}
