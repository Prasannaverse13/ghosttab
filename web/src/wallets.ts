/**
 * Wallet-only identity. There is no sign-in or sign-up: connecting a wallet is the whole account system.
 *  - MetaMask  -> Ethereum + Tempo (both EVM)
 *  - Phantom   -> Solana
 *  - Zcash     -> no browser wallet; shielded deposits go to an address (see the app)
 */
import { claimMessage } from './claim.js';

declare global {
  interface Window { ethereum?: any; phantom?: any; solana?: any }
}

export type WalletKind = 'metamask' | 'phantom';
export interface WalletState { kind: WalletKind; address: string; chainId?: string }

const EVM_NAMES: Record<string, string> = { '0x1': 'Ethereum', '0xaa36a7': 'Sepolia' };
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const chainName = (id?: string) => (id ? EVM_NAMES[id.toLowerCase()] ?? `chain ${parseInt(id, 16)}` : '');

export function findMetaMask(): any | null {
  const e = window.ethereum;
  if (!e) return null;
  const list: any[] = Array.isArray(e.providers) && e.providers.length ? e.providers : [e];
  return list.find((p) => p.isMetaMask && !p.isPhantom && !p.isBraveWallet) ?? null;
}

export function findPhantom(): any | null {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

const KEY = 'gt.wallet';
const remember = (k: WalletKind | null) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch { /* storage may be blocked */ } };
const remembered = (): WalletKind | null => { try { return localStorage.getItem(KEY) as WalletKind | null; } catch { return null; } };

class WalletManager extends EventTarget {
  state: WalletState | null = null;
  /** Resolves once the silent restore attempt has finished. */
  ready: Promise<void> = Promise.resolve();

  private set(s: WalletState | null) {
    this.state = s;
    this.dispatchEvent(new Event('change'));
  }

  async connect(kind: WalletKind): Promise<WalletState> {
    if (kind === 'metamask') {
      const p = findMetaMask();
      if (!p) throw new Error('MetaMask is not installed');
      const accounts: string[] = await p.request({ method: 'eth_requestAccounts' });
      const chainId: string = await p.request({ method: 'eth_chainId' });
      this.bindEvm(p);
      remember('metamask');
      this.set({ kind, address: accounts[0], chainId });
      return this.state!;
    }
    const p = findPhantom();
    if (!p) throw new Error('Phantom is not installed');
    const res = await p.connect();
    this.bindSolana(p);
    remember('phantom');
    this.set({ kind, address: res.publicKey.toString() });
    return this.state!;
  }

  /** Silently restore a previous connection (no popup). */
  restore(): Promise<void> { return (this.ready = this.doRestore()); }
  private async doRestore() {
    const k = remembered();
    try {
      if (k === 'metamask') {
        const p = findMetaMask();
        const accounts: string[] = p ? await p.request({ method: 'eth_accounts' }) : [];
        if (p && accounts[0]) {
          this.bindEvm(p);
          this.set({ kind: 'metamask', address: accounts[0], chainId: await p.request({ method: 'eth_chainId' }) });
        }
      } else if (k === 'phantom') {
        const p = findPhantom();
        const res = p ? await p.connect({ onlyIfTrusted: true }) : null;
        if (p && res) {
          this.bindSolana(p);
          this.set({ kind: 'phantom', address: res.publicKey.toString() });
        }
      }
    } catch { /* not trusted yet: user must click connect */ }
  }

  async disconnect() {
    try { if (this.state?.kind === 'phantom') await findPhantom()?.disconnect(); } catch { /* ignore */ }
    remember(null);
    this.set(null);
  }

  private bindEvm(p: any) {
    p.removeListener?.('accountsChanged', this.onAccounts);
    p.removeListener?.('chainChanged', this.onChain);
    p.on?.('accountsChanged', this.onAccounts);
    p.on?.('chainChanged', this.onChain);
  }
  private onAccounts = (a: string[]) => {
    if (!a.length) return void this.disconnect();
    if (this.state) this.set({ ...this.state, address: a[0] });
  };
  private onChain = (id: string) => {
    if (this.state) this.set({ ...this.state, chainId: id });
  };
  private bindSolana(p: any) {
    p.on?.('disconnect', () => this.set(null));
    p.on?.('accountChanged', (pk: any) => (pk ? this.state && this.set({ ...this.state, address: pk.toString() }) : this.set(null)));
  }

  // ---------- signing ----------
  /** Prove you own the depositing wallet. Returns the signature in the encoding the mint expects. */
  async signClaim(chain: 'solana' | 'ethereum' | 'tempo', txid: string): Promise<string> {
    const msg = claimMessage(chain, txid);
    const s = this.state;
    if (!s) throw new Error('connect a wallet first');
    if (s.kind === 'metamask') {
      const hex = '0x' + Array.from(new TextEncoder().encode(msg), (b) => b.toString(16).padStart(2, '0')).join('');
      return findMetaMask().request({ method: 'personal_sign', params: [hex, s.address] });
    }
    const { signature } = await findPhantom().signMessage(new TextEncoder().encode(msg), 'utf8');
    let bin = '';
    for (const b of signature as Uint8Array) bin += String.fromCharCode(b);
    return btoa(bin); // base64, as the mint's Solana verifier expects
  }

  // ---------- deposits (live mode) ----------
  async sendEvmUsdc(p: { to: string; token: string; usdc: number; chainId?: number; add?: { name: string; rpc: string; explorer?: string } }): Promise<string> {
    const mm = findMetaMask();
    if (!mm || this.state?.kind !== 'metamask') throw new Error('connect MetaMask first');
    if (p.chainId) {
      const want = '0x' + p.chainId.toString(16);
      if ((this.state.chainId ?? '').toLowerCase() !== want) {
        try {
          await mm.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
        } catch (e: any) {
          if (e?.code !== 4902 && e?.code !== -32603) throw e;
          if (!p.add) throw new Error('This network is not in MetaMask yet. Add it, then retry.');
          await mm.request({ method: 'wallet_addEthereumChain', params: [{
            chainId: want, chainName: p.add.name, rpcUrls: [p.add.rpc],
            nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
            ...(p.add.explorer ? { blockExplorerUrls: [p.add.explorer] } : {}),
          }] });
        }
      }
    }
    const pad = (h: string) => h.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const amount = BigInt(Math.round(p.usdc * 1e6)).toString(16);
    const data = '0xa9059cbb' + pad(p.to) + pad(amount); // transfer(address,uint256)
    const hash: string = await mm.request({ method: 'eth_sendTransaction', params: [{ from: this.state.address, to: p.token, data }] });
    for (let i = 0; i < 90; i++) {
      const r = await mm.request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (r) {
        if (r.status !== '0x1') throw new Error('transaction reverted');
        return hash;
      }
      await new Promise((r2) => setTimeout(r2, 2000));
    }
    throw new Error('timed out waiting for confirmation');
  }

  async sendSolanaUsdc(p: { to: string; usdcMint: string; usdc: number; rpc: string }): Promise<string> {
    const ph = findPhantom();
    if (!ph || this.state?.kind !== 'phantom') throw new Error('connect Phantom first');
    // loaded on demand: web3.js is large and only needed here. It expects Node's Buffer, which browsers lack.
    if (!(globalThis as any).Buffer) { const m: any = await import('buffer/'); (globalThis as any).Buffer = m.Buffer ?? m.default?.Buffer; }
    const [{ Connection, PublicKey, Transaction }, spl] = await Promise.all([import('@solana/web3.js'), import('@solana/spl-token')]);
    const conn = new Connection(p.rpc, 'confirmed');
    const owner = new PublicKey(this.state.address);
    const mint = new PublicKey(p.usdcMint);
    const dest = new PublicKey(p.to);
    const fromAta = spl.getAssociatedTokenAddressSync(mint, owner);
    const toAta = spl.getAssociatedTokenAddressSync(mint, dest, true);
    const tx = new Transaction().add(
      spl.createAssociatedTokenAccountIdempotentInstruction(owner, toAta, dest, mint),
      spl.createTransferCheckedInstruction(fromAta, mint, toAta, owner, BigInt(Math.round(p.usdc * 1e6)), 6),
    );
    tx.feePayer = owner;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    const { signature } = await ph.signAndSendTransaction(tx);
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    return signature;
  }
}

export const wallet = new WalletManager();
