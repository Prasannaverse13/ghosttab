import { MintError, SCHEME, TokenWallet, encodePayment, type MintApi, type PaymentRequired, type Token } from '@ghosttab/core';
import { HttpMint } from './http.js';

export interface PaymentEvent {
  url: string;
  units: number;
  balanceAfter: number;
}

export interface AgentOptions {
  /** A mint URL, or any MintApi (e.g. an in-process Mint). */
  mint: string | MintApi;
  /** Restore a previously saved wallet. */
  tokens?: Token[];
  /** Safety rail: refuse to pay more than this many units for a single call. Default 1000 units ($1). */
  maxUnitsPerCall?: number;
  /** Override fetch (tests, sandboxes). */
  fetchImpl?: typeof fetch;
  onPayment?: (e: PaymentEvent) => void;
}

/**
 * An x402 client that pays with blind-signed credit. Drop-in for `fetch`:
 *
 *   const agent = new GhostAgent({ mint: 'http://localhost:8402' });
 *   await agent.fund(claimId, units);
 *   const res = await agent.fetch('https://api.example.com/whales');
 */
export class GhostAgent {
  readonly wallet: TokenWallet;
  readonly mint: MintApi;
  private f: typeof fetch;
  private maxUnits: number;
  private onPayment?: (e: PaymentEvent) => void;

  constructor(opts: AgentOptions) {
    this.mint = typeof opts.mint === 'string' ? new HttpMint(opts.mint) : opts.mint;
    this.wallet = new TokenWallet(this.mint, opts.tokens ?? []);
    this.f = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.maxUnits = opts.maxUnitsPerCall ?? 1000;
    this.onPayment = opts.onPayment;
  }

  balance(): number {
    return this.wallet.balance();
  }

  /** Turn a claim ticket (from a verified deposit) into spendable blind tokens. */
  fund(claimId: string, units: number): Promise<number> {
    return this.wallet.mintFromClaim(claimId, units);
  }

  save(): Token[] {
    return this.wallet.toJSON();
  }

  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = String(input);
    const first = await this.f(url, init);
    if (first.status !== 402) return first;

    let challenge: PaymentRequired;
    try {
      challenge = (await first.clone().json()) as PaymentRequired;
    } catch {
      return first; // 402 we can't interpret (e.g. a non-x402 paywall)
    }
    const req = challenge.accepts?.find((a) => a.scheme === SCHEME);
    if (!req) return first;

    const units = Number(req.maxAmountRequired);
    if (!Number.isInteger(units) || units <= 0) throw new MintError('bad_challenge', 'seller asked for an invalid amount');
    if (units > this.maxUnits) throw new MintError('over_budget', `seller wants ${units} units, above the per-call limit of ${this.maxUnits}`);

    const tokens = await this.wallet.take(units);
    const headers = new Headers(init?.headers);
    headers.set('X-PAYMENT', encodePayment(tokens));
    const paid = await this.f(url, { ...init, headers });

    if (paid.status === 402) {
      // The seller rejected it. If the tokens were never burned they are still good, but we cannot tell: surface it.
      throw new MintError('payment_rejected', 'seller rejected the payment; tokens may be spent');
    }
    this.onPayment?.({ url, units, balanceAfter: this.balance() });
    return paid;
  }
}
