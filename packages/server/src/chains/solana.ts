import { Connection } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { MintError, UNIT_MICRO_USDC } from '@ghosttab/core';
import { claimMessage, type DepositVerifier } from './types.js';

/**
 * Verifies an SPL-USDC transfer to the mint's address.
 * UNTESTED against live devnet in this repo's CI: exercise it with a real devnet transfer before demoing.
 */
export class SolanaVerifier implements DepositVerifier {
  private conn: Connection;
  constructor(rpc: string, private mintAddress: string, private usdcMint: string) {
    this.conn = new Connection(rpc, 'confirmed');
  }

  async verify(txid: string, signature: string) {
    const tx = await this.conn.getParsedTransaction(txid, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    const meta = tx?.meta;
    if (!tx || !meta || meta.err) throw new MintError('tx_not_found', 'transaction not found or failed', 404);

    const sender = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58();
    if (!sender) throw new MintError('bad_tx', 'no signer in transaction');

    const sum = (bals: typeof meta.preTokenBalances) =>
      (bals ?? [])
        .filter((b) => b.owner === this.mintAddress && b.mint === this.usdcMint)
        .reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
    const received = sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
    if (received <= 0n) throw new MintError('no_deposit', 'transaction did not deposit USDC to the mint');

    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(claimMessage('solana', txid)),
      Uint8Array.from(Buffer.from(signature, 'base64')),
      bs58.decode(sender),
    );
    if (!ok) throw new MintError('bad_signature', 'claim signature does not match the depositing wallet', 401);

    return { depositor: sender, units: Number(received / BigInt(UNIT_MICRO_USDC)) };
  }
}
