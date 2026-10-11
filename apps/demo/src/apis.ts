/**
 * Three pay-per-call APIs behind GhostTab: the sellers in the demo. All data is live:
 *   /price      SOL/USD spot from Coinbase
 *   /sentiment  Crypto Fear & Greed index (alternative.me)
 *   /fees       Solana recent prioritization fees, read from the configured Solana RPC
 * Payouts go to SELLER_PAYOUT_ADDRESS (a real Solana wallet) in real USDC.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ghosttab, HttpMint } from '@ghosttab/sdk';

const MINT = process.env.GHOSTTAB_MINT ?? 'http://localhost:8402';
const PORT = Number(process.env.DEMO_PORT ?? 4020);
const SOLANA_RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const PAYOUT = process.env.SELLER_PAYOUT_ADDRESS;
if (!PAYOUT) {
  console.error('Set SELLER_PAYOUT_ADDRESS to a Solana wallet that should receive the sellers\' USDC payouts.');
  process.exit(1);
}
const mint = new HttpMint(MINT);

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return r.json() as Promise<any>;
}

const catalog = [
  { path: '/price', name: 'PriceFeed', price: 0.005, blurb: 'SOL/USD spot price' },
  { path: '/sentiment', name: 'SentimentPulse', price: 0.005, blurb: 'Crypto Fear & Greed index' },
  { path: '/fees', name: 'FeeRadar', price: 0.01, blurb: 'Solana priority fees, last slots' },
] as const;

const handlers: Record<string, () => Promise<unknown>> = {
  '/price': async () => {
    const j = await getJson('https://api.coinbase.com/v2/prices/SOL-USD/spot');
    return { source: 'coinbase', pair: 'SOL-USD', price: Number(j.data.amount) };
  },
  '/sentiment': async () => {
    const j = await getJson('https://api.alternative.me/fng/?limit=1');
    const d = j.data[0];
    return { source: 'alternative.me', value: Number(d.value), label: d.value_classification };
  },
  '/fees': async () => {
    const j = await getJson(SOLANA_RPC, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPrioritizationFees', params: [] }),
    });
    const fees: number[] = (j.result ?? []).map((x: any) => x.prioritizationFee).sort((a: number, b: number) => a - b);
    const at = (q: number) => fees.length ? fees[Math.min(fees.length - 1, Math.floor(q * fees.length))] : 0;
    return { source: 'solana-rpc', samples: fees.length, microLamportsPerCu: { p50: at(0.5), p90: at(0.9), max: fees.at(-1) ?? 0 } };
  },
};

const app = express();
app.use(cors({ exposedHeaders: ['X-PAYMENT-RESPONSE'] })); // lets the browser app call these APIs
const sellers: { name: string; secret: string; id: string }[] = [];

for (const c of catalog) {
  const { sellerId, secret } = await mint.registerSeller(c.name, { chain: 'solana', address: PAYOUT });
  sellers.push({ name: c.name, secret, id: sellerId });
  app.get(c.path, ghosttab.protect({ price: c.price, mint, sellerId, sellerSecret: secret, description: c.blurb }), async (_req, res) => {
    try {
      res.json({ asof: new Date().toISOString(), ...(await handlers[c.path]()) as object });
    } catch (e) {
      res.status(502).json({ error: `upstream failed: ${(e as Error).message}` });
    }
  });
}

async function settleAll() {
  const out: { seller: string; units: number; txid?: string }[] = [];
  for (const s of sellers) {
    try {
      const p = await mint.settle(s.secret);
      if (p) {
        out.push({ seller: s.name, units: p.units, txid: p.txid });
        console.log(`settled ${s.name}: ${p.units} units ($${(p.units / 1000).toFixed(3)}) -> ${p.to.slice(0, 8)}…  tx ${p.txid}`);
      }
    } catch (e) {
      console.error(`settle ${s.name} failed:`, (e as Error).message);
    }
  }
  return out;
}

app.get('/', (_req, res) => res.json({ apis: catalog.map((c) => ({ path: c.path, price: `$${c.price}`, name: c.name })) }));
// Pay sellers out right now instead of waiting for the next batch (used by the app's "Settle now" button).
app.post('/settle', async (_req, res) => res.json(await settleAll()));
app.listen(PORT, () => console.log(`demo APIs on http://localhost:${PORT}  (${catalog.map((c) => `${c.path} $${c.price}`).join(', ')})  payouts -> ${PAYOUT}`));

// Batch settlement: sellers get ONE payout per interval, not one per call.
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 30000);
setInterval(() => void settleAll(), SETTLE_MS);
