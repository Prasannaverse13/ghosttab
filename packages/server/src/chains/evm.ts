import { createPublicClient, http, parseAbiItem, recoverMessageAddress, getAddress, type Hex } from 'viem';
import { MintError, UNIT_MICRO_USDC } from '@ghosttab/core';
import { claimMessage, type DepositVerifier } from './types.js';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

/**
 * Verifies an ERC-20 USDC transfer to the mint's address on any EVM chain (Ethereum Sepolia, Tempo testnet, ...).
 * Assumes the stablecoin has 6 decimals. Not yet exercised end to end with MetaMask: run one real testnet transfer before relying on it.
 */
export class EvmVerifier implements DepositVerifier {
  private client;
  constructor(private chain: 'ethereum' | 'tempo', rpc: string, private usdc: string, private mintAddress: string) {
    this.client = createPublicClient({ transport: http(rpc) });
  }

  async verify(txid: string, signature: string) {
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: txid as Hex });
    } catch {
      throw new MintError('tx_not_found', 'transaction not found', 404);
    }
    if (receipt.status !== 'success') throw new MintError('tx_failed', 'transaction reverted');

    const logs = (await this.client.getLogs({
      address: this.usdc as Hex, event: TRANSFER, args: { to: this.mintAddress as Hex },
      fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    })).filter((l) => l.transactionHash === receipt.transactionHash);
    const received = logs.reduce((a, l) => a + (l.args.value ?? 0n), 0n);
    if (received <= 0n) throw new MintError('no_deposit', 'transaction did not deposit USDC to the mint');

    const signer = await recoverMessageAddress({ message: claimMessage(this.chain, txid), signature: signature as Hex });
    if (getAddress(signer) !== getAddress(receipt.from)) throw new MintError('bad_signature', 'claim signature does not match the depositing wallet', 401);

    return { depositor: getAddress(receipt.from), units: Number(received / BigInt(UNIT_MICRO_USDC)) };
  }
}
