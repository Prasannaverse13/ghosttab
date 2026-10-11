/** Must match packages/server/src/chains/types.ts exactly. */
export const claimMessage = (chain: string, txid: string) => `GhostTab claim\nchain: ${chain}\ntx: ${txid}`;
