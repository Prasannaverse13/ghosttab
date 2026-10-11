/**
 * x402 glue for the `ghosttab-blind` scheme.
 *
 * A seller answers 402 with an `accepts` entry; the agent retries with an `X-PAYMENT` header whose payload is
 * a bundle of blind-signed tokens instead of an on-chain transaction.
 */
import { type MintApi, type Token, MintError, NETWORK, SCHEME, UNIT_MICRO_USDC } from './types.js';
import { jsonB64u, parseJsonB64u } from './util.js';

export interface PaymentRequirement {
  scheme: typeof SCHEME;
  network: typeof NETWORK;
  maxAmountRequired: string; // credit units, as a string per x402 convention
  resource: string;
  description: string;
  mimeType: string;
  payTo: string; // seller id at the mint
  asset: 'GTU';
  extra: { unitMicroUsdc: number; mint?: string };
}

export interface PaymentRequired {
  x402Version: 1;
  error: string;
  accepts: PaymentRequirement[];
}

export function buildChallenge(p: { units: number; sellerId: string; resource: string; description?: string; mintUrl?: string; error?: string }): PaymentRequired {
  return {
    x402Version: 1,
    error: p.error ?? 'X-PAYMENT header is required',
    accepts: [{
      scheme: SCHEME, network: NETWORK, maxAmountRequired: String(p.units), resource: p.resource,
      description: p.description ?? '', mimeType: 'application/json', payTo: p.sellerId, asset: 'GTU',
      extra: { unitMicroUsdc: UNIT_MICRO_USDC, mint: p.mintUrl },
    }],
  };
}

export function encodePayment(tokens: Token[]): string {
  return jsonB64u({ x402Version: 1, scheme: SCHEME, network: NETWORK, payload: { tokens: tokens.map((t) => [t.d, t.m, t.s]) } });
}

export function decodePayment(header: string): Token[] {
  let body: any;
  try {
    body = parseJsonB64u(header);
  } catch {
    throw new MintError('bad_payment', 'X-PAYMENT is not valid base64url JSON');
  }
  if (body?.scheme !== SCHEME || !Array.isArray(body?.payload?.tokens)) throw new MintError('bad_payment', 'unsupported payment scheme');
  const tokens = body.payload.tokens as unknown[];
  if (tokens.length > 64) throw new MintError('bad_payment', 'too many tokens');
  return tokens.map((t) => {
    if (!Array.isArray(t) || t.length !== 3) throw new MintError('bad_payment', 'malformed token');
    return { d: Number(t[0]), m: String(t[1]), s: String(t[2]) };
  });
}

export type VerifyResult =
  | { ok: true; units: number }
  | { ok: false; status: number; error: string };

/** Seller-side: validate an X-PAYMENT header against a price and settle it with the mint. */
export async function verifyPayment(mint: MintApi, sellerSecret: string, header: string, priceUnits: number): Promise<VerifyResult> {
  try {
    const tokens = decodePayment(header);
    const sum = tokens.reduce((a, t) => a + t.d, 0);
    if (sum < priceUnits) return { ok: false, status: 402, error: `payment of ${sum} units is below the price of ${priceUnits}` };
    const r = await mint.spend(sellerSecret, tokens);
    return { ok: true, units: r.units };
  } catch (e) {
    if (e instanceof MintError) return { ok: false, status: e.code === 'double_spend' ? 402 : e.status === 401 ? 500 : 402, error: e.message };
    return { ok: false, status: 402, error: 'payment could not be verified' };
  }
}

export function receiptHeader(units: number): string {
  return jsonB64u({ success: true, network: NETWORK, units });
}
