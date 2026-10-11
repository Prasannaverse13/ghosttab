/**
 * An autonomous agent that funds its tab with a REAL USDC transfer on Solana, then buys data privately.
 * Needs: the mint (npm run dev), the demo APIs (npm run demo:apis), and a Solana wallet holding USDC + a little SOL
 * on the same cluster as the mint.
 *
 *   AGENT_SOLANA_SECRET=<base58 secret key>  DEPOSIT_USDC=1  npm run demo:agent
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ghosttab, HttpMint } from '@ghosttab/sdk';

const MINT = process.env.GHOSTTAB_MINT ?? 'http://localhost:8402';
const API = process.env.API_URL ?? 'http://localhost:4020';
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const DEPOSIT = Number(process.env.DEPOSIT_USDC ?? 1);
if (!process.env.AGENT_SOLANA_SECRET) {
  console.error('Set AGENT_SOLANA_SECRET (base58 secret key of a funded Solana wallet).');
  process.exit(1);
}

const kp = Keypair.fromSecretKey(bs58.decode(process.env.AGENT_SOLANA_SECRET));
const mint = new HttpMint(MINT);
const info = await mint.info();
const sol_ = info.chains?.solana;
if (!sol_?.enabled) throw new Error('This mint has no Solana deposits configured.');

// Tokens are bearer cash. Keep them on disk so a crash never strands funds.
const TOKENS = process.env.AGENT_TOKENS_FILE ?? '.agent-tokens.json';
const saved = existsSync(TOKENS) ? JSON.parse(readFileSync(TOKENS, 'utf8')) : [];
const save = () => writeFileSync(TOKENS, JSON.stringify(agent.wallet.toJSON()), { mode: 0o600 });
const agent = ghosttab.agent({
  mint,
  maxUnitsPerCall: 50,
  tokens: saved,
  onPayment: (e) => { save(); console.log(`   paid ${e.units} units, ${e.balanceAfter} left`); },
});
const NEED = ROUNDS * 20; // 3 APIs per round: 5 + 5 + 10 units

if (agent.balance() >= NEED) {
  console.log(`1) reusing ${agent.balance()} saved units from ${TOKENS}; no new deposit needed\n`);
} else {
{
  const c = new Connection(info.solanaRpc, 'confirmed');
  const solBal = (await c.getBalance(kp.publicKey)) / 1e9;
  let bal = 0;
  try { bal = Number((await c.getTokenAccountBalance(spl.getAssociatedTokenAddressSync(new PublicKey(sol_.usdcMint), kp.publicKey))).value.uiAmount ?? 0); } catch { /* no token account */ }
  if (solBal < 0.005 || bal < DEPOSIT) {
    console.error(`Agent wallet ${kp.publicKey.toBase58()} has ${solBal.toFixed(3)} SOL and ${bal} USDC; it needs >= 0.005 SOL and >= ${DEPOSIT} USDC on ${sol_.network}.`);
    console.error('Run: npm run check -- --airdrop   (free devnet SOL), then get devnet USDC at https://faucet.circle.com');
    process.exit(1);
  }
}
console.log(`1) deposit ${DEPOSIT} USDC on Solana ${sol_.network} from ${kp.publicKey.toBase58().slice(0, 8)}… (the only on-chain trace)`);
const conn = new Connection(info.solanaRpc, 'confirmed');
const usdc = new PublicKey(sol_.usdcMint);
const dest = new PublicKey(sol_.depositAddress);
const fromAta = spl.getAssociatedTokenAddressSync(usdc, kp.publicKey);
const toAta = spl.getAssociatedTokenAddressSync(usdc, dest, true);
const tx = new Transaction().add(
  spl.createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, toAta, dest, usdc),
  spl.createTransferCheckedInstruction(fromAta, usdc, toAta, kp.publicKey, BigInt(Math.round(DEPOSIT * 1e6)), 6),
);
const txid = await conn.sendTransaction(tx, [kp]);
const bh = await conn.getLatestBlockhash();
await conn.confirmTransaction({ signature: txid, ...bh }, 'confirmed');
console.log(`   tx ${txid}`);

const sig = Buffer.from(nacl.sign.detached(new TextEncoder().encode(`GhostTab claim\nchain: solana\ntx: ${txid}`), kp.secretKey)).toString('base64');
let claim;
for (let i = 0; i < 10; i++) {
  try { claim = await mint.claim('solana', txid, sig); break; } catch (e: any) {
    if (e.code !== 'tx_not_found') throw e;
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (!claim) throw new Error('mint could not see the deposit yet; retry in a moment');
await agent.fund(claim.claimId, claim.units);
console.log(`   funded ${claim.units} units ($${claim.units / 1000}), wallet holds ${agent.wallet.tokens.length} blind tokens\n`);

  save();
}

console.log('2) buy data, call after call');
let calls = 0;
for (let i = 0; i < ROUNDS; i++) {
  for (const path of ['/price', '/sentiment', '/fees']) {
    const res = await agent.fetch(API + path).catch((e) => {
      console.error(`Cannot reach ${API}. Start the demo APIs first: npm run demo:apis  (${(e.cause?.code ?? e.message)})`);
      process.exit(1);
    });
    calls++;
    console.log(`${path.padEnd(11)} ${res.status}  ${JSON.stringify(await res.json()).slice(0, 80)}…`);
  }
}

console.log(`\n3) what an on-chain observer sees after ${calls} paid calls:`);
for (const e of await mint.ledger()) {
  console.log(e.kind === 'deposit'
    ? `   DEPOSIT  ${e.from.slice(0, 10)}… -> mint   $${e.units / 1000}`
    : `   PAYOUT   mint -> ${e.to.slice(0, 10)}… (${e.sellerName})   $${e.units / 1000}`);
}
console.log(`\n   plain x402 would have published ${calls} wallet->seller payments linking this agent to every API it used.`);
console.log('   (seller payouts land on-chain at the next settlement batch)');
