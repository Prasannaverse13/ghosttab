/**
 * Moves devnet SOL + USDC from the agent wallet (AGENT_SOLANA_SECRET) to any address, e.g. your Phantom wallet.
 *   npm run send -- <solana address> [usdc=5] [sol=0.5]
 */
import 'dotenv/config';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import bs58 from 'bs58';

const [to, usdcArg, solArg] = process.argv.slice(2);
if (!to) { console.error('usage: npm run send -- <solana address> [usdc=5] [sol=0.5]'); process.exit(1); }
if (!process.env.AGENT_SOLANA_SECRET) { console.error('AGENT_SOLANA_SECRET is not set in .env'); process.exit(1); }
let dest: PublicKey;
try { dest = new PublicKey(to); } catch { console.error(`"${to}" is not a Solana address (use the Solana one from Phantom, not 0x...)`); process.exit(1); }

const usdcAmt = Number(usdcArg ?? 5);
const solAmt = Number(solArg ?? 0.5);
const conn = new Connection(process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com', 'confirmed');
const usdc = new PublicKey(process.env.SOLANA_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const from = Keypair.fromSecretKey(bs58.decode(process.env.AGENT_SOLANA_SECRET));

const fromAta = spl.getAssociatedTokenAddressSync(usdc, from.publicKey);
const toAta = spl.getAssociatedTokenAddressSync(usdc, dest, true);
const tx = new Transaction();
if (solAmt > 0) tx.add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: dest, lamports: Math.round(solAmt * LAMPORTS_PER_SOL) }));
if (usdcAmt > 0) tx.add(
  spl.createAssociatedTokenAccountIdempotentInstruction(from.publicKey, toAta, dest, usdc),
  spl.createTransferCheckedInstruction(fromAta, usdc, toAta, from.publicKey, BigInt(Math.round(usdcAmt * 1e6)), 6),
);
const sig = await conn.sendTransaction(tx, [from]);
const bh = await conn.getLatestBlockhash();
await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
console.log(`sent ${solAmt} SOL + ${usdcAmt} USDC to ${dest.toBase58()}`);
console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
