/**
 * Shows the SOL and USDC balances of the wallets in .env, and (with --airdrop) requests free devnet SOL.
 *   npm run check            # balances only
 *   npm run check -- --airdrop
 */
import 'dotenv/config';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';

const rpc = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const usdc = new PublicKey(process.env.SOLANA_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const conn = new Connection(rpc, 'confirmed');
const airdrop = process.argv.includes('--airdrop');

const wallets: [string, PublicKey][] = [];
const add = (name: string, secret?: string, addr?: string) => {
  if (secret) wallets.push([name, Keypair.fromSecretKey(bs58.decode(secret)).publicKey]);
  else if (addr) wallets.push([name, new PublicKey(addr)]);
};
add('mint wallet (pays sellers)', process.env.SOLANA_PAYOUT_SECRET);
add('agent wallet (CLI demo)', process.env.AGENT_SOLANA_SECRET);
add('seller payout address', undefined, process.env.SELLER_PAYOUT_ADDRESS);
for (const a of process.argv.filter((x) => x.length > 30 && !x.startsWith('-'))) add('extra: ' + a.slice(0, 6), undefined, a);

console.log(`RPC ${rpc}\n`);
for (const [name, pk] of wallets) {
  let sol = (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
  if (airdrop && sol < 0.05 && !name.startsWith('seller')) {
    try {
      const sig = await conn.requestAirdrop(pk, LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, 'confirmed');
      sol = (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
      console.log(`  airdropped 1 SOL to ${name}`);
    } catch (e) {
      console.log(`  airdrop failed for ${name} (${(e as Error).message.slice(0, 60)}). Use https://faucet.solana.com`);
    }
  }
  let u = 0;
  try { u = Number((await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(usdc, pk, true))).value.uiAmount ?? 0); } catch { /* no token account yet */ }
  console.log(`${name}\n  ${pk.toBase58()}\n  ${sol.toFixed(3)} SOL   ${u.toFixed(2)} USDC   ${sol < 0.01 ? '<- needs SOL' : ''}${u === 0 && !name.startsWith('seller') ? '  <- needs USDC (faucet.circle.com)' : ''}\n`);
}
