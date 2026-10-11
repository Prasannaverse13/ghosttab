/** Prints fresh Solana keypairs for the mint hot wallet and a test agent. Never commit the output. */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const mintW = Keypair.generate();
const agentW = Keypair.generate();
const sellerW = Keypair.generate();
console.log(`# --- paste into .env (keep it out of git) ---
SOLANA_PAYOUT_SECRET=${bs58.encode(mintW.secretKey)}
SELLER_PAYOUT_ADDRESS=${sellerW.publicKey.toBase58()}
AGENT_SOLANA_SECRET=${bs58.encode(agentW.secretKey)}

# --- fund these (devnet): ---
# mint wallet  ${mintW.publicKey.toBase58()}   needs ~0.1 SOL (fees + token accounts) and USDC to pay sellers
# agent wallet ${agentW.publicKey.toBase58()}   needs ~0.05 SOL and some USDC to deposit
# SOL:  https://faucet.solana.com     USDC: https://faucet.circle.com (Solana devnet)`);
