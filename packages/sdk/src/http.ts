import { MintError, type BlindedOutput, type BlindSig, type Chain, type LedgerEvent, type MintApi, type MintStats, type Payout, type PublicKeys, type Token } from '@ghosttab/core';

/** MintApi over HTTP. Works in Node 18+ and browsers. */
export class HttpMint implements MintApi {
  private base: string;
  constructor(baseUrl: string, private f: typeof fetch = (...a) => fetch(...a)) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, secret?: string): Promise<T> {
    const res = await this.f(this.base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!res.ok) throw new MintError(json?.code ?? 'http_error', json?.error ?? `mint returned ${res.status}`, res.status);
    return json as T;
  }

  keys() { return this.call<PublicKeys>('GET', '/v1/keys'); }
  issue(claimId: string, outputs: BlindedOutput[]) { return this.call<BlindSig[]>('POST', '/v1/issue', { claimId, outputs }); }
  swap(tokens: Token[], outputs: BlindedOutput[]) { return this.call<BlindSig[]>('POST', '/v1/swap', { tokens, outputs }); }
  spend(sellerSecret: string, tokens: Token[]) { return this.call<{ units: number }>('POST', '/v1/spend', { tokens }, sellerSecret); }
  registerSeller(name: string, payout: { chain: Chain; address: string }) { return this.call<{ sellerId: string; secret: string }>('POST', '/v1/sellers', { name, payout }); }
  sellerBalance(sellerSecret: string) { return this.call<{ balance: number; totalEarned: number; calls: number }>('GET', '/v1/seller/balance', undefined, sellerSecret); }
  settle(sellerSecret: string) { return this.call<Payout | null>('POST', '/v1/settle', {}, sellerSecret); }
  ledger() { return this.call<LedgerEvent[]>('GET', '/v1/ledger'); }
  stats() { return this.call<MintStats>('GET', '/v1/stats'); }

  // not part of MintApi: chain deposits
  info() { return this.call<any>('GET', '/v1/info'); }
  claim(chain: Chain, txid: string, signature: string) { return this.call<{ claimId: string; units: number }>('POST', '/v1/claim', { chain, txid, signature }); }
}
