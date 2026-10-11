# GhostTab demo video: 2:30

Record at 1080p, browser zoom 110%. Have ready: Phantom on Solana devnet with devnet SOL + USDC, mint and demo APIs
running (or the deployed URL), a block explorer tab for the mint wallet and the seller wallet.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00 | Landing page hero | "Agents are about to pay for everything over x402. But on x402, every paid call is a public receipt: which data your trading agent buys, how often, how much. That is your strategy, on-chain, forever." |
| 0:20 | Scroll to the three cards | "GhostTab fixes that. You fund once from Solana, Tempo or Ethereum. Your agent then pays per call with blind-signed credit, so there is no on-chain trail from a call back to your wallet." |
| 0:40 | Click Launch App, connect wallet | "No accounts, no sign-up. Your wallet is your identity." Connect Phantom. |
| 0:55 | App, card 1 | Select Solana, amount 1, click Deposit. "This is a real USDC transfer on Solana devnet." Approve in Phantom. |
| 1:15 | Sign claim prompt, then tokens appear | "I sign a claim so only the depositor can redeem it. The mint verifies the deposit on-chain, then signs tokens it cannot see. These denominations are my bearer cash." |
| 1:35 | Card 3, Run agent (3 rounds) | "My agent calls three real paid APIs: SOL price, market sentiment, Solana fees. Each call is a normal 402, the agent retries with tokens in the X-PAYMENT header, data comes back." |
| 1:55 | Split view, left panel | "Here is what plain x402 would have published: nine payments from my wallet to three sellers. A competitor reads my data diet." |
| 2:05 | Split view, right panel, click Settle | "Here is GhostTab: one deposit, and one batched payout per seller. Nothing says who bought what." |
| 2:15 | Explorer tab: deposit tx and a payout tx | "And these are real transactions on Solana devnet." |
| 2:25 | Roadmap slide or README | "Next: a federated FROST mint so no single operator holds funds, and shielded Zcash deposits. GhostTab. Go ghost." |

## Before you hit record
1. Do one full dry run so tokens, the settle and the explorer links are warm.
2. Keep the amount at 1 USDC; 3 rounds costs $0.06.
3. If a payout fails, check the mint wallet has SOL and USDC.
