export interface VerifiedDeposit {
  depositor: string;
  units: number;
}

export interface DepositVerifier {
  /** Verify that `txid` paid the mint, and that `signature` over claimMessage() was made by the depositor. */
  verify(txid: string, signature: string): Promise<VerifiedDeposit>;
}

/** The exact text a depositor signs to claim a deposit. Binding the claim to the sender stops front-running. */
export const claimMessage = (chain: string, txid: string) => `GhostTab claim\nchain: ${chain}\ntx: ${txid}`;
