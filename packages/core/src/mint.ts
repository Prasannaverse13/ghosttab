import { RSABSSA } from '@cloudflare/blindrsa-ts';
import {
  type BlindedOutput, type BlindSig, type Chain, type Claim, type LedgerEvent, type MintApi, type MintStats,
  type Payout, type PublicKeys, type SellerRecord, type Token, DENOMS, MintError, UNIT_MICRO_USDC,
} from './types.js';
import { fromHex, randomHex, sha256Hex, toHex } from './util.js';
import { parsePrivateJwk, rawSign, type RsaPrivate } from './rawrsa.js';

export const suite = RSABSSA.SHA384.PSS.Deterministic();

const RSA_PSS = { name: 'RSA-PSS', hash: 'SHA-384' } as const;

/** Serializable mint state. Persist this however you like (file, KV, DB). */
export interface MintState {
  keys: Record<string, { priv: JsonWebKey; pub: JsonWebKey }>;
  claims: Record<string, Claim>;
  claimByTx: Record<string, string>;
  spent: Record<string, number>;
  sellers: Record<string, SellerRecord>;
  payouts: Record<string, Payout>;
  ledger: LedgerEvent[];
  totals: { deposited: number; issued: number; spentTokens: number; spentUnits: number; paidOut: number };
}

const emptyState = (): MintState => ({
  keys: {}, claims: {}, claimByTx: {}, spent: {}, sellers: {}, payouts: {}, ledger: [],
  totals: { deposited: 0, issued: 0, spentTokens: 0, spentUnits: 0, paidOut: 0 },
});

export interface MintOptions {
  state?: MintState;
  /** Called after every state change so a server can persist. */
  onChange?: (s: MintState) => void;
  modulusLength?: number;
}

/**
 * The GhostTab mint. Environment-agnostic: runs in Node (server) and in the browser (sandbox demo).
 *
 * Privacy model: the mint learns depositor -> amount at deposit time and seller -> amount at spend time,
 * but because every token is blind-signed it cannot link a spent token to the deposit that funded it.
 */
export class Mint implements MintApi {
  private pubKeys = new Map<number, CryptoKey>();
  private signers = new Map<number, RsaPrivate>();

  private constructor(public state: MintState, private onChange?: (s: MintState) => void) {}

  static async create(opts: MintOptions = {}): Promise<Mint> {
    const state = opts.state ?? emptyState();
    const mint = new Mint(state, opts.onChange);
    for (const d of DENOMS) {
      const k = state.keys[d];
      if (k) {
        mint.pubKeys.set(d, await crypto.subtle.importKey('jwk', k.pub, RSA_PSS, true, ['verify']));
        mint.signers.set(d, parsePrivateJwk(k.priv));
      } else {
        const kp = await RSABSSA.SHA384.generateKey({
          modulusLength: opts.modulusLength ?? 2048,
          publicExponent: Uint8Array.from([1, 0, 1]),
        });
        mint.pubKeys.set(d, kp.publicKey);
        const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
        mint.signers.set(d, parsePrivateJwk(priv));
        state.keys[d] = { pub: await crypto.subtle.exportKey('jwk', kp.publicKey), priv };
      }
    }
    if (!opts.state) mint.changed();
    return mint;
  }

  private changed() {
    this.onChange?.(this.state);
  }

  // ---------- public keys ----------
  async keys(): Promise<PublicKeys> {
    const keys: Record<string, JsonWebKey> = {};
    for (const d of DENOMS) keys[d] = this.state.keys[d].pub;
    return { unitMicroUsdc: UNIT_MICRO_USDC, keys };
  }

  // ---------- deposits ----------
  /**
   * Record a verified on-chain deposit and return the secret claim ticket.
   * Callers (the server's chain adapters) verify the deposit BEFORE calling this.
   */
  createClaim(p: { chain: Chain; txid: string; depositor: string; units: number }): Claim {
    if (!Number.isInteger(p.units) || p.units <= 0) throw new MintError('bad_amount', 'units must be a positive integer');
    const key = `${p.chain}:${p.txid}`;
    if (this.state.claimByTx[key]) throw new MintError('already_claimed', 'this deposit was already claimed', 409);
    const claim: Claim = {
      id: randomHex(16), chain: p.chain, txid: p.txid, depositor: p.depositor,
      units: p.units, issued: 0, createdAt: Date.now(),
    };
    this.state.claims[claim.id] = claim;
    this.state.claimByTx[key] = claim.id;
    this.state.totals.deposited += p.units;
    this.state.ledger.push({ t: claim.createdAt, kind: 'deposit', chain: p.chain, from: p.depositor, units: p.units, txid: p.txid });
    this.changed();
    return claim;
  }

  claimInfo(claimId: string): { units: number; issued: number; remaining: number } {
    const c = this.state.claims[claimId];
    if (!c) throw new MintError('unknown_claim', 'unknown claim ticket', 404);
    return { units: c.units, issued: c.issued, remaining: c.units - c.issued };
  }

  // ---------- issuing ----------
  async issue(claimId: string, outputs: BlindedOutput[]): Promise<BlindSig[]> {
    const claim = this.state.claims[claimId];
    if (!claim) throw new MintError('unknown_claim', 'unknown claim ticket', 404);
    const total = this.sumOutputs(outputs);
    // reserve synchronously so concurrent issue calls cannot overdraw the claim
    if (claim.issued + total > claim.units) throw new MintError('insufficient_claim', 'outputs exceed the unissued balance of this claim');
    claim.issued += total;
    this.state.totals.issued += total;
    try {
      const sigs = await this.signAll(outputs);
      this.changed();
      return sigs;
    } catch (e) {
      claim.issued -= total;
      this.state.totals.issued -= total;
      throw e;
    }
  }

  /** Exchange tokens for fresh blind-signed tokens of the same total value (making change). */
  async swap(tokens: Token[], outputs: BlindedOutput[]): Promise<BlindSig[]> {
    const inTotal = tokens.reduce((a, t) => a + t.d, 0);
    const outTotal = this.sumOutputs(outputs);
    if (inTotal !== outTotal) throw new MintError('unbalanced', `inputs ${inTotal} != outputs ${outTotal}`);
    const release = await this.consume(tokens);
    try {
      const sigs = await this.signAll(outputs);
      this.changed();
      return sigs;
    } catch (e) {
      release();
      throw e;
    }
  }

  // ---------- spending (sellers) ----------
  async registerSeller(name: string, payout: { chain: Chain; address: string }): Promise<{ sellerId: string; secret: string }> {
    const secret = `gts_${randomHex(24)}`;
    const id = randomHex(8);
    this.state.sellers[id] = {
      id, name: name.slice(0, 64), payout, secretHash: await sha256Hex(secret),
      balance: 0, totalEarned: 0, calls: 0,
    };
    this.changed();
    return { sellerId: id, secret };
  }

  private async seller(secret: string): Promise<SellerRecord> {
    const h = await sha256Hex(secret);
    const s = Object.values(this.state.sellers).find((x) => x.secretHash === h);
    if (!s) throw new MintError('bad_seller', 'unknown seller credentials', 401);
    return s;
  }

  /** Verify + burn tokens and credit the seller. This is the double-spend check. */
  async spend(sellerSecret: string, tokens: Token[]): Promise<{ units: number }> {
    const seller = await this.seller(sellerSecret);
    const units = tokens.reduce((a, t) => a + t.d, 0);
    await this.consume(tokens);
    seller.balance += units;
    seller.totalEarned += units;
    seller.calls += 1;
    this.state.totals.spentTokens += tokens.length;
    this.state.totals.spentUnits += units;
    this.changed();
    return { units };
  }

  async sellerBalance(sellerSecret: string) {
    const s = await this.seller(sellerSecret);
    return { balance: s.balance, totalEarned: s.totalEarned, calls: s.calls };
  }

  /** Batch settlement: zero the seller's balance and emit a single payout (the only on-chain trace). */
  async settle(sellerSecret: string): Promise<Payout | null> {
    const s = await this.seller(sellerSecret);
    if (s.balance <= 0) return null;
    const payout: Payout = {
      id: randomHex(8), sellerId: s.id, chain: s.payout.chain, to: s.payout.address,
      units: s.balance, createdAt: Date.now(),
    };
    s.balance = 0;
    this.state.payouts[payout.id] = payout;
    this.state.totals.paidOut += payout.units;
    this.state.ledger.push({ t: payout.createdAt, kind: 'payout', chain: payout.chain, to: payout.to, units: payout.units, sellerName: s.name });
    this.changed();
    return payout;
  }

  /** Called by a payout adapter once the transfer has been broadcast. */
  recordPayoutTx(payoutId: string, txid: string) {
    const p = this.state.payouts[payoutId];
    if (!p) return;
    p.txid = txid;
    for (let i = this.state.ledger.length - 1; i >= 0; i--) {
      const e = this.state.ledger[i];
      if (e.kind === 'payout' && e.to === p.to && e.units === p.units && !e.txid) { e.txid = txid; break; }
    }
    this.changed();
  }

  async ledger(): Promise<LedgerEvent[]> {
    return this.state.ledger.slice(-200);
  }

  async stats(): Promise<MintStats> {
    const t = this.state.totals;
    return {
      depositedUnits: t.deposited, issuedUnits: t.issued, spentTokens: t.spentTokens,
      spentUnits: t.spentUnits, paidOutUnits: t.paidOut, sellers: Object.keys(this.state.sellers).length,
    };
  }

  // ---------- internals ----------
  private sumOutputs(outputs: BlindedOutput[]): number {
    if (!outputs.length || outputs.length > 64) throw new MintError('bad_outputs', 'between 1 and 64 outputs required');
    let total = 0;
    for (const o of outputs) {
      if (!(DENOMS as readonly number[]).includes(o.d)) throw new MintError('bad_denom', `unsupported denomination ${o.d}`);
      total += o.d;
    }
    return total;
  }

  private async signAll(outputs: BlindedOutput[]): Promise<BlindSig[]> {
    return Promise.all(
      outputs.map(async (o) => {
        await Promise.resolve(); // yield so large batches don't starve the event loop
        const S = rawSign(this.signers.get(o.d)!, fromHex(o.B));
        return { d: o.d, S: toHex(S) };
      }),
    );
  }

  /**
   * Atomically mark tokens spent. Keys are reserved synchronously BEFORE any await so two concurrent
   * requests presenting the same token cannot both succeed. Returns a rollback for later failures.
   */
  private async consume(tokens: Token[]): Promise<() => void> {
    if (!tokens.length || tokens.length > 64) throw new MintError('bad_tokens', 'between 1 and 64 tokens required');
    const keys: string[] = [];
    const rollback = () => keys.forEach((k) => delete this.state.spent[k]);
    for (const t of tokens) {
      if (!(DENOMS as readonly number[]).includes(t.d) || !/^[0-9a-f]{64}$/.test(t.m) || !/^[0-9a-f]+$/.test(t.s)) {
        rollback();
        throw new MintError('bad_token', 'malformed token');
      }
      const k = `${t.d}:${t.m}`;
      if (this.state.spent[k]) {
        rollback();
        throw new MintError('double_spend', 'token already spent', 409);
      }
      this.state.spent[k] = Date.now();
      keys.push(k);
    }
    try {
      const ok = await Promise.all(tokens.map((t) => suite.verify(this.pubKeys.get(t.d)!, fromHex(t.s), fromHex(t.m))));
      if (ok.some((x) => !x)) throw new MintError('bad_signature', 'token signature is not valid', 402);
    } catch (e) {
      rollback();
      throw e instanceof MintError ? e : new MintError('bad_token', 'token could not be verified');
    }
    return rollback;
  }
}
