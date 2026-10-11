import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { Mint, MintError, type Chain } from '@ghosttab/core';
import type { Config } from './config.js';
import type { DepositVerifier } from './chains/types.js';
import type { PayoutAdapter } from './payout.js';

export interface AppDeps {
  mint: Mint;
  cfg: Config;
  verifiers: Partial<Record<Chain, DepositVerifier>>;
  payout: PayoutAdapter;
}

const bearer = (req: Request): string => {
  const h = req.header('authorization') ?? '';
  if (!h.startsWith('Bearer ')) throw new MintError('unauthorized', 'missing seller credentials', 401);
  return h.slice(7);
};

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

export function createApp({ mint, cfg, verifiers, payout }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/v1/info', (_req, res) => {
    res.json({
      name: 'GhostTab mint', unitMicroUsdc: 1000, solanaRpc: cfg.solana.rpc,
      chains: {
        solana: verifiers.solana ? { enabled: true, network: cfg.solana.cluster, depositAddress: cfg.solana.mintAddress, usdcMint: cfg.solana.usdcMint } : { enabled: false },
        ethereum: verifiers.ethereum ? { enabled: true, depositAddress: cfg.evm.mintAddress, usdc: cfg.evm.ethereum.usdc, chainId: cfg.evm.ethereum.chainId, name: 'Sepolia' } : { enabled: false },
        tempo: verifiers.tempo ? { enabled: true, depositAddress: cfg.evm.mintAddress, usdc: cfg.evm.tempo.usdc, chainId: cfg.evm.tempo.chainId, rpc: cfg.evm.tempo.rpc, name: 'Tempo Testnet (Moderato)', explorer: 'https://explore.testnet.tempo.xyz' } : { enabled: false },
        zcash: { enabled: false, note: 'shielded deposits: roadmap' },
      },
    });
  });

  app.get('/v1/keys', wrap(async (_req, res) => res.json(await mint.keys())));
  app.get('/v1/ledger', wrap(async (_req, res) => res.json(await mint.ledger())));
  app.get('/v1/stats', wrap(async (_req, res) => res.json(await mint.stats())));

  // Verify an on-chain deposit and hand the depositor a secret claim ticket.
  app.post('/v1/claim', wrap(async (req, res) => {
    const { chain, txid, signature } = req.body ?? {};
    const v = verifiers[chain as Chain];
    if (!v) throw new MintError('unsupported_chain', `chain "${chain}" is not enabled`);
    if (typeof txid !== 'string' || typeof signature !== 'string') throw new MintError('bad_request', 'txid and signature required');
    const d = await v.verify(txid, signature);
    const claim = mint.createClaim({ chain: chain as Chain, txid, depositor: d.depositor, units: d.units });
    res.json({ claimId: claim.id, units: claim.units });
  }));

  app.post('/v1/issue', wrap(async (req, res) => res.json(await mint.issue(String(req.body?.claimId), req.body?.outputs ?? []))));
  app.post('/v1/swap', wrap(async (req, res) => res.json(await mint.swap(req.body?.tokens ?? [], req.body?.outputs ?? []))));

  app.post('/v1/sellers', wrap(async (req, res) => {
    const { name, payout: p } = req.body ?? {};
    if (typeof name !== 'string' || !p?.address) throw new MintError('bad_request', 'name and payout.address required');
    res.json(await mint.registerSeller(name, { chain: (p.chain as Chain) ?? 'solana', address: String(p.address) }));
  }));

  app.post('/v1/spend', wrap(async (req, res) => res.json(await mint.spend(bearer(req), req.body?.tokens ?? []))));
  app.get('/v1/seller/balance', wrap(async (req, res) => res.json(await mint.sellerBalance(bearer(req)))));

  app.post('/v1/settle', wrap(async (req, res) => {
    const p = await mint.settle(bearer(req));
    if (!p) return res.json(null);
    try {
      const txid = await payout.send(p);
      mint.recordPayoutTx(p.id, txid);
      res.json({ ...p, txid });
    } catch (e) {
      // put the money back so the seller can retry
      const s = mint.state.sellers[p.sellerId];
      s.balance += p.units;
      mint.state.totals.paidOut -= p.units;
      throw new MintError('payout_failed', `payout failed: ${(e as Error).message}`, 502);
    }
  }));

  // Same-origin gateway to the demo seller APIs, so one public URL serves the site, the mint and the paid APIs.
  app.all('/demo/*', express.raw({ type: () => true, limit: '64kb' }), async (req, res) => {
    try {
      const target = cfg.demoApiUrl + req.originalUrl.slice('/demo'.length);
      const headers: Record<string, string> = {};
      for (const h of ['x-payment', 'content-type', 'accept']) { const v = req.header(h); if (v) headers[h] = v; }
      const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;
      const r = await fetch(target, { method: req.method, headers, body: hasBody ? req.body : undefined, signal: AbortSignal.timeout(20000) });
      res.status(r.status);
      for (const h of ['content-type', 'x-payment-response']) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.status(502).json({ error: 'demo APIs are not running (npm run demo:apis)', code: 'demo_unavailable' });
    }
  });

  app.use(express.static(cfg.webDir));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MintError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'internal error', code: 'internal' });
  });
  return app;
}
