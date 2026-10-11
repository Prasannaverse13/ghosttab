import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { Mint, type Chain, type MintState } from '@ghosttab/core';
import { config as cfg } from './config.js';
import { createApp } from './app.js';
import { makePayoutAdapter } from './payout.js';
import type { DepositVerifier } from './chains/types.js';
import { SolanaVerifier } from './chains/solana.js';
import { EvmVerifier } from './chains/evm.js';

// --- persistence: JSON snapshot, written atomically. It holds the mint's private keys: protect the file. ---
let timer: NodeJS.Timeout | undefined;
const persist = (s: MintState) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    mkdirSync(dirname(cfg.stateFile), { recursive: true });
    const tmp = `${cfg.stateFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    renameSync(tmp, cfg.stateFile);
  }, 100);
};

const state: MintState | undefined = existsSync(cfg.stateFile) ? JSON.parse(readFileSync(cfg.stateFile, 'utf8')) : undefined;
const mint = await Mint.create({ state, onChange: persist });

if (cfg.solana.payoutSecret && !cfg.solana.mintAddress) {
  // one hot wallet both receives deposits and pays sellers
  cfg.solana.mintAddress = Keypair.fromSecretKey(bs58.decode(cfg.solana.payoutSecret)).publicKey.toBase58();
}
const verifiers: Partial<Record<Chain, DepositVerifier>> = {};
if (cfg.solana.mintAddress) verifiers.solana = new SolanaVerifier(cfg.solana.rpc, cfg.solana.mintAddress, cfg.solana.usdcMint);
if (cfg.evm.mintAddress) {
  for (const c of ['ethereum', 'tempo'] as const) {
    const e = cfg.evm[c];
    if (e.rpc && e.usdc) verifiers[c] = new EvmVerifier(c, e.rpc, e.usdc, cfg.evm.mintAddress);
  }
}

if (!Object.keys(verifiers).length) {
  console.error('No chain is configured. Set SOLANA_MINT_ADDRESS and/or EVM_MINT_ADDRESS (+ RPC/USDC for Tempo). See .env.example.');
  process.exit(1);
}
let payout;
try { payout = makePayoutAdapter(cfg); } catch (e) { console.error((e as Error).message); process.exit(1); }

const app = createApp({ mint, cfg, verifiers, payout });
app.listen(cfg.port, () => {
  console.log(`GhostTab mint listening on http://localhost:${cfg.port}`);
  console.log(`  solana:   ${cfg.solana.cluster} (${cfg.solana.rpc})`);
  console.log(`  chains:   ${Object.keys(verifiers).join(', ') || 'none configured'}`);
  console.log(`  state:    ${cfg.stateFile}`);
});
