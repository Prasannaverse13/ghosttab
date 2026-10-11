/**
 * GhostTab protocol types.
 *
 * 1 credit unit = 0.001 USDC. Credit is carried by Chaumian blind-signed tokens,
 * one RSA key per denomination (the Cashu model, applied to x402).
 */

export const UNIT_MICRO_USDC = 1000; // 1 unit = 1000 micro-USDC = $0.001
export const DENOMS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const;
export type Denom = (typeof DENOMS)[number];

export const SCHEME = 'ghosttab-blind';
export const NETWORK = 'ghosttab';

export type Chain = 'solana' | 'tempo' | 'ethereum' | 'zcash' | 'dev';

/** A spendable bearer token. m = random 32-byte message, s = unblinded RSA-PSS signature (both hex). */
export interface Token {
  d: number;
  m: string;
  s: string;
}

/** What a client sends to be signed: the blinded message for one denomination. */
export interface BlindedOutput {
  d: number;
  B: string; // hex
}

/** What the mint returns: the blind signature for one output. */
export interface BlindSig {
  d: number;
  S: string; // hex
}

export interface PublicKeys {
  unitMicroUsdc: number;
  keys: Record<string, JsonWebKey>; // denomination -> RSA-PSS public key (JWK)
}

export interface Claim {
  id: string; // secret claim ticket, returned only to the depositor
  chain: Chain;
  txid: string;
  depositor: string;
  units: number;
  issued: number;
  createdAt: number;
}

export interface SellerRecord {
  id: string;
  name: string;
  payout: { chain: Chain; address: string };
  secretHash: string;
  balance: number; // units owed, not yet settled
  totalEarned: number;
  calls: number;
}

export interface Payout {
  id: string;
  sellerId: string;
  chain: Chain;
  to: string;
  units: number;
  txid?: string;
  createdAt: number;
}

/** Everything an on-chain observer could see. Note what is NOT here: per-call data. */
export type LedgerEvent =
  | { t: number; kind: 'deposit'; chain: Chain; from: string; units: number; txid: string }
  | { t: number; kind: 'payout'; chain: Chain; to: string; units: number; txid?: string; sellerName: string };

export interface MintStats {
  depositedUnits: number;
  issuedUnits: number;
  spentTokens: number;
  spentUnits: number;
  paidOutUnits: number;
  sellers: number;
}

/** The mint API surface. `Mint` implements it in-process; `HttpMint` (sdk) implements it over HTTP. */
export interface MintApi {
  keys(): Promise<PublicKeys>;
  issue(claimId: string, outputs: BlindedOutput[]): Promise<BlindSig[]>;
  swap(tokens: Token[], outputs: BlindedOutput[]): Promise<BlindSig[]>;
  spend(sellerSecret: string, tokens: Token[]): Promise<{ units: number }>;
  registerSeller(name: string, payout: { chain: Chain; address: string }): Promise<{ sellerId: string; secret: string }>;
  sellerBalance(sellerSecret: string): Promise<{ balance: number; totalEarned: number; calls: number }>;
  settle(sellerSecret: string): Promise<Payout | null>;
  ledger(): Promise<LedgerEvent[]>;
  stats(): Promise<MintStats>;
}

export class MintError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

/** Convert USDC (e.g. 0.01) to credit units, rounding up so sellers are never underpaid. */
export const usdcToUnits = (usdc: number): number => Math.ceil(Math.round(usdc * 1e6) / UNIT_MICRO_USDC);
export const unitsToUsdc = (units: number): number => (units * UNIT_MICRO_USDC) / 1e6;

/** Greedy change-making over the denomination set. */
export function split(units: number): number[] {
  const out: number[] = [];
  let rest = units;
  for (const d of [...DENOMS].reverse()) {
    while (rest >= d) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}
