import { MintError, buildChallenge, receiptHeader, usdcToUnits, verifyPayment, type MintApi } from '@ghosttab/core';
import { HttpMint } from './http.js';

/** Minimal structural types so this works with Express, Connect, or anything similar. */
interface Req { header(name: string): string | undefined; protocol: string; originalUrl: string; get(name: string): string | undefined }
interface Res { status(code: number): Res; json(body: unknown): unknown; setHeader(k: string, v: string): unknown }
type Next = (err?: unknown) => void;

export interface ProtectOptions {
  /** Price in USDC, e.g. 0.01. */
  price?: number;
  /** Or price directly in credit units (1 unit = $0.001). */
  priceUnits?: number;
  description?: string;
  /** Defaults: GHOSTTAB_MINT, GHOSTTAB_SELLER_ID, GHOSTTAB_SELLER_SECRET. */
  mint?: string | MintApi;
  sellerId?: string;
  sellerSecret?: string;
}

/**
 * Express middleware that puts an endpoint behind a GhostTab paywall.
 *
 *   app.get('/whales', ghosttab.protect({ price: 0.01 }), handler);
 */
export function protect(opts: ProtectOptions = {}) {
  const units = opts.priceUnits ?? (opts.price !== undefined ? usdcToUnits(opts.price) : NaN);
  if (!Number.isInteger(units) || units <= 0) throw new Error('protect(): set price (USDC) or priceUnits');
  const mintRef = opts.mint ?? process.env.GHOSTTAB_MINT;
  const sellerId = opts.sellerId ?? process.env.GHOSTTAB_SELLER_ID;
  const secret = opts.sellerSecret ?? process.env.GHOSTTAB_SELLER_SECRET;
  if (!mintRef || !sellerId || !secret) throw new Error('protect(): mint, sellerId and sellerSecret are required (or GHOSTTAB_* env vars)');
  const mintUrl = typeof mintRef === 'string' ? mintRef : undefined;
  const mint: MintApi = typeof mintRef === 'string' ? new HttpMint(mintRef) : mintRef;

  return async (req: Req, res: Res, next: Next) => {
    const resource = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const header = req.header('x-payment');
    if (!header) return void res.status(402).json(buildChallenge({ units, sellerId, resource, description: opts.description, mintUrl }));

    const r = await verifyPayment(mint, secret, header, units);
    if (!r.ok) return void res.status(402).json(buildChallenge({ units, sellerId, resource, description: opts.description, mintUrl, error: r.error }));
    res.setHeader('X-PAYMENT-RESPONSE', receiptHeader(r.units));
    next();
  };
}

export { MintError };
