import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import bs58 from 'bs58';
import { UNIT_MICRO_USDC, type Payout } from '@ghosttab/core';
import type { Config } from './config.js';

export interface PayoutAdapter {
  /** Send the payout on-chain and return the transaction id. */
  send(p: Payout): Promise<string>;
}

/** Pays sellers in real USDC (devnet or mainnet, per config) from the mint's hot wallet. */
export class SolanaPayout implements PayoutAdapter {
  private conn: Connection;
  private payer: Keypair;
  private usdc: PublicKey;
  constructor(cfg: Config['solana']) {
    this.conn = new Connection(cfg.rpc, 'confirmed');
    this.payer = Keypair.fromSecretKey(bs58.decode(cfg.payoutSecret!));
    this.usdc = new PublicKey(cfg.usdcMint);
  }
  async send(p: Payout) {
    const from = await getOrCreateAssociatedTokenAccount(this.conn, this.payer, this.usdc, this.payer.publicKey);
    const to = await getOrCreateAssociatedTokenAccount(this.conn, this.payer, this.usdc, new PublicKey(p.to));
    return transfer(this.conn, this.payer, from.address, to.address, this.payer, BigInt(p.units) * BigInt(UNIT_MICRO_USDC));
  }
}

export function makePayoutAdapter(cfg: Config): PayoutAdapter {
  if (!cfg.solana.payoutSecret) throw new Error('SOLANA_PAYOUT_SECRET is required: sellers are paid in real USDC from this wallet.');
  return new SolanaPayout(cfg.solana);
}
