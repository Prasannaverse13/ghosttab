# GhostTab

**Private pay-per-call payments for AI agents.** Fund once from Solana, Tempo, Ethereum (or Zcash, roadmap), then pay
for APIs over [x402](https://x402.org) with blind-signed credit. The chain sees one deposit and batched seller
payouts. It never sees which wallet bought what.

## How it works

1. **Deposit** USDC to the mint on any supported chain, then sign a claim message with the same wallet.
2. The mint verifies the deposit and hands back a secret **claim ticket**.
3. The agent **blinds** random token messages and the mint signs them (RSA blind signatures, RFC 9474), one key per
   denomination. The mint cannot link a token it later sees to the deposit that paid for it.
4. The agent calls a paid API, gets `402 Payment Required` (scheme `ghosttab-blind`), and retries with
   `X-PAYMENT: <tokens>`.
5. The seller's middleware sends the tokens to the mint (`/v1/spend`), which checks the signature, burns them
   (double-spend protection) and credits the seller.
6. Sellers are paid in **batches** (`/v1/settle`): one on-chain payout, not one per call.

1 credit unit = $0.001.

## Run it

Needs Node 22+.

```bash
npm install
npm run keygen         # prints fresh Solana keys + what to fund; copy .env.example to .env and paste them
npm run dev            # mint on http://localhost:8402, also serves the website + app
# in two more terminals:
npm run demo:apis      # three paid APIs on :4020 with live data, settling to sellers every 30s
npm run demo:agent     # a CLI agent: real USDC deposit, buys data, prints what the chain saw
npm test               # 11 tests: blind issuance, double-spend (incl. concurrent), forgery, change-making
```

Open http://localhost:8402/app.html, connect MetaMask or Phantom, and deposit real USDC. Phantom must be on the same
cluster as the mint (Settings > Developer Settings > Testnet Mode for devnet). There is no sandbox, faucet or simulated
payout: the mint refuses to start without a payout wallet and at least one configured chain.

## Deploy

One container serves the site, the mint API and the demo APIs (via `/demo`):

```bash
docker build -t ghosttab .
docker run -p 8080:8080 -v ghosttab-data:/data --env-file .env ghosttab
```

or on Fly.io: `fly launch --no-deploy`, `fly volumes create ghosttab_data --size 1`,
`fly secrets set SOLANA_PAYOUT_SECRET=... SELLER_PAYOUT_ADDRESS=...`, `fly deploy` (see `fly.toml`).
Wallet connection needs HTTPS, which Fly provides. Demo video script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Layout

| Path | What |
| --- | --- |
| `packages/core` | Isomorphic mint, token wallet, x402 helpers. Runs in Node and the browser. |
| `packages/server` | Express mint API, JSON-file state, Solana and EVM deposit verification, payout adapters. |
| `packages/sdk` | `ghosttab.agent()` (x402 client) and `ghosttab.protect()` (Express middleware). |
| `apps/demo` | Three paid APIs and an autonomous agent. |
| `web` | Landing page and app (wallet-only: MetaMask for Ethereum/Tempo, Phantom for Solana). |

## Seller integration

```ts
import { ghosttab } from '@ghosttab/sdk';
app.get('/whales', ghosttab.protect({ price: 0.01 }), handler);   // GHOSTTAB_MINT / _SELLER_ID / _SELLER_SECRET
```

## Agent integration

```ts
const agent = ghosttab.agent({ mint: 'http://localhost:8402', maxUnitsPerCall: 50 });
await agent.fund(claimId, units);
const res = await agent.fetch('https://api.example.com/whales');   // pays automatically
```

## Honest status

* **Tested:** the crypto and mint logic (11 tests), the HTTP flow, the wallet-gated UI.
* **Written but not yet exercised against live networks:** Solana/EVM deposit verification, Solana payouts, the
  real-wallet deposit transactions, and the live-data APIs. Do one small devnet run end to end before the demo.
* **Tempo** defaults to the Moderato testnet (chain 42431, pathUSD). MetaMask is prompted to add the network. Get test pathUSD from the Tempo faucet.
* **Zcash** shielded deposits are roadmap.
* **The v1 mint is custodial** (like Cashu): it holds deposits and could refuse to pay out. Keep balances small.
  Roadmap: a federated mint using FROST threshold signatures.
* **Privacy needs traffic.** The mint sees depositor and amount at deposit, and seller and amount at spend. Blind
  signing breaks the link between them, but a mint with one user and one seller is trivially correlated by timing.
