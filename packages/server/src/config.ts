import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  demoApiUrl: string;
  stateFile: string;
  webDir: string;
  solana: { cluster: string; rpc: string; mintAddress?: string; usdcMint: string; payoutSecret?: string };
  evm: Record<'ethereum' | 'tempo', { rpc?: string; usdc?: string; chainId?: number }> & { mintAddress?: string };
}

const env = process.env;

export const config: Config = {
  port: Number(env.PORT ?? 8402),
  demoApiUrl: (env.DEMO_API_URL ?? 'http://localhost:4020').replace(/\/$/, ''),
  stateFile: env.STATE_FILE ?? './data/mint.json',
  webDir: env.WEB_DIR ?? fileURLToPath(new URL('../../../web', import.meta.url)),
  solana: {
    cluster: env.SOLANA_CLUSTER ?? 'devnet', // label shown in the app: devnet | mainnet-beta
    rpc: env.SOLANA_RPC ?? 'https://api.devnet.solana.com',
    mintAddress: env.SOLANA_MINT_ADDRESS,
    // Circle devnet USDC. Verify before relying on it.
    usdcMint: env.SOLANA_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    payoutSecret: env.SOLANA_PAYOUT_SECRET, // base58 secret key of the mint's hot wallet (optional)
  },
  evm: {
    mintAddress: env.EVM_MINT_ADDRESS,
    // Circle USDC on Sepolia. Verify before relying on it.
    ethereum: { rpc: env.EVM_ETHEREUM_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com', usdc: env.EVM_ETHEREUM_USDC ?? '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', chainId: 11155111 },
    // Tempo testnet (Moderato). pathUSD is the faucet stablecoin (6 decimals). Source: tempo.xyz developer docs.
    tempo: { rpc: env.EVM_TEMPO_RPC ?? 'https://rpc.moderato.tempo.xyz', usdc: env.EVM_TEMPO_USDC ?? '0x20c0000000000000000000000000000000000000', chainId: env.EVM_TEMPO_CHAIN_ID ? Number(env.EVM_TEMPO_CHAIN_ID) : 42431 },
  },
};
