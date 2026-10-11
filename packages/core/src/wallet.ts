import { type BlindedOutput, type MintApi, type PublicKeys, type Token, MintError, split } from './types.js';
import { suite } from './mint.js';
import { fromHex, randomBytes, toHex } from './util.js';

const RSA_PSS = { name: 'RSA-PSS', hash: 'SHA-384' } as const;

interface Pending {
  d: number;
  m: Uint8Array;
  inv: Uint8Array;
}

/**
 * Client-side token wallet. Holds blind-signed bearer tokens, makes change via the mint's swap endpoint,
 * and never reveals which deposit funded which token.
 */
export class TokenWallet {
  tokens: Token[] = [];
  private pub = new Map<number, CryptoKey>();

  constructor(private mint: MintApi, tokens: Token[] = []) {
    this.tokens = tokens;
  }

  toJSON(): Token[] {
    return this.tokens;
  }

  balance(): number {
    return this.tokens.reduce((a, t) => a + t.d, 0);
  }

  private async keyFor(d: number): Promise<CryptoKey> {
    let k = this.pub.get(d);
    if (!k) {
      const keys: PublicKeys = await this.mint.keys();
      for (const [dk, jwk] of Object.entries(keys.keys)) {
        this.pub.set(+dk, await crypto.subtle.importKey('jwk', jwk, RSA_PSS, true, ['verify']));
      }
      k = this.pub.get(d);
    }
    if (!k) throw new MintError('bad_denom', `mint has no key for ${d}`);
    return k;
  }

  private async blindAll(denoms: number[]): Promise<{ outputs: BlindedOutput[]; pending: Pending[] }> {
    const outputs: BlindedOutput[] = [];
    const pending: Pending[] = [];
    for (const d of denoms) {
      const m = randomBytes(32);
      const { blindedMsg, inv } = await suite.blind(await this.keyFor(d), m);
      outputs.push({ d, B: toHex(blindedMsg) });
      pending.push({ d, m, inv });
    }
    return { outputs, pending };
  }

  private async unblind(pending: Pending[], sigs: { d: number; S: string }[]): Promise<Token[]> {
    const out: Token[] = [];
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      const s = await suite.finalize(await this.keyFor(p.d), p.m, fromHex(sigs[i].S), p.inv);
      if (!(await suite.verify(await this.keyFor(p.d), s, p.m))) throw new MintError('bad_signature', 'mint returned an invalid signature');
      out.push({ d: p.d, m: toHex(p.m), s: toHex(s) });
    }
    return out;
  }

  /** Redeem (part of) a claim ticket into blind-signed tokens. */
  async mintFromClaim(claimId: string, units: number): Promise<number> {
    const { outputs, pending } = await this.blindAll(split(units));
    const sigs = await this.mint.issue(claimId, outputs);
    this.tokens.push(...(await this.unblind(pending, sigs)));
    return units;
  }

  /**
   * Take exactly `units` of tokens out of the wallet, swapping at the mint for change if needed.
   * On any failure the wallet is left unchanged.
   */
  async take(units: number): Promise<Token[]> {
    if (units <= 0) throw new MintError('bad_amount', 'amount must be positive');
    if (this.balance() < units) throw new MintError('insufficient_funds', `need ${units} units, wallet has ${this.balance()}`);
    const exact = this.pickExact(units);
    if (exact) return exact;

    // make change: swap enough tokens for [exact denominations] + [change denominations]
    const sorted = [...this.tokens].sort((a, b) => b.d - a.d);
    const chosen: Token[] = [];
    let sum = 0;
    for (const t of sorted) {
      if (sum >= units) break;
      chosen.push(t);
      sum += t.d;
    }
    const wants = [...split(units), ...split(sum - units)];
    const { outputs, pending } = await this.blindAll(wants);
    const sigs = await this.mint.swap(chosen, outputs);
    const fresh = await this.unblind(pending, sigs);
    this.remove(chosen);
    this.tokens.push(...fresh);
    const picked = this.pickExact(units);
    if (!picked) throw new MintError('change_failed', 'could not assemble exact amount after swap');
    return picked;
  }

  /** Put tokens back (e.g. the seller rejected the payment before spending them). */
  restore(tokens: Token[]) {
    this.tokens.push(...tokens);
  }

  private pickExact(units: number): Token[] | null {
    const pool = [...this.tokens].sort((a, b) => b.d - a.d);
    const picked: Token[] = [];
    let rest = units;
    for (const t of pool) {
      if (t.d <= rest) {
        picked.push(t);
        rest -= t.d;
      }
    }
    if (rest !== 0) return null;
    this.remove(picked);
    return picked;
  }

  private remove(ts: Token[]) {
    const drop = new Set(ts.map((t) => `${t.d}:${t.m}`));
    this.tokens = this.tokens.filter((t) => !drop.has(`${t.d}:${t.m}`));
  }
}
