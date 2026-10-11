/** Shared by the landing page and the app: the wallet button in the nav, and the connect modal. */
import { wallet, short, findMetaMask, findPhantom, chainName, type WalletKind } from './wallets.js';

const modal = document.createElement('div');
modal.className = 'modal';
modal.hidden = true;
modal.innerHTML = `
  <div class="modal-scrim" data-close></div>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mtitle">
    <button class="modal-x" type="button" aria-label="Close" data-close>×</button>
    <span class="burst-s" aria-hidden="true">✺</span>
    <h2 id="mtitle">Connect a <em>wallet</em></h2>
    <p class="modal-sub">No account, no sign-up. Your wallet is your identity.</p>
    <button class="wopt" type="button" data-kind="metamask">
      <span class="wopt-ico" style="background:#f6851b">🦊</span>
      <span><b>MetaMask</b><small>Ethereum and Tempo</small></span>
      <i class="wopt-state"></i>
    </button>
    <button class="wopt" type="button" data-kind="phantom">
      <span class="wopt-ico" style="background:#ab9ff2">👻</span>
      <span><b>Phantom</b><small>Solana</small></span>
      <i class="wopt-state"></i>
    </button>
    <div class="wopt wopt-off">
      <span class="wopt-ico" style="background:#efc23a">Z</span>
      <span><b>Zcash</b><small>No browser wallet: deposits go to a shielded address in the app</small></span>
    </div>
    <p class="modal-err" role="alert" hidden></p>
  </div>`;
document.body.appendChild(modal);

const err = modal.querySelector<HTMLElement>('.modal-err')!;
const open = () => { modal.hidden = false; refreshOptions(); (modal.querySelector('.wopt:not(.wopt-off)') as HTMLElement)?.focus(); };
const close = () => { modal.hidden = true; err.hidden = true; };

function refreshOptions() {
  const have: Record<WalletKind, boolean> = { metamask: !!findMetaMask(), phantom: !!findPhantom() };
  modal.querySelectorAll<HTMLButtonElement>('.wopt[data-kind]').forEach((b) => {
    const k = b.dataset.kind as WalletKind;
    b.querySelector('.wopt-state')!.textContent = have[k] ? (wallet.state?.kind === k ? 'Connected' : 'Detected') : 'Install';
  });
}

modal.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-close]')) return close();
  const b = t.closest<HTMLButtonElement>('.wopt[data-kind]');
  if (!b) return;
  const kind = b.dataset.kind as WalletKind;
  const installed = kind === 'metamask' ? findMetaMask() : findPhantom();
  if (!installed) {
    window.open(kind === 'metamask' ? 'https://metamask.io/download/' : 'https://phantom.com/download', '_blank', 'noopener');
    err.textContent = `${kind === 'metamask' ? 'MetaMask' : 'Phantom'} isn't installed in this browser. Install it, then reload.`;
    err.hidden = false;
    return;
  }
  try {
    b.disabled = true;
    await wallet.connect(kind);
    close();
  } catch (ex: any) {
    err.textContent = ex?.code === 4001 ? 'Connection request was declined.' : ex?.message ?? 'Could not connect.';
    err.hidden = false;
  } finally {
    b.disabled = false;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

// --- nav button(s) ---
const buttons = () => document.querySelectorAll<HTMLButtonElement>('[data-connect]');
function paint() {
  const s = wallet.state;
  buttons().forEach((b) => {
    b.classList.toggle('connected', !!s);
    b.innerHTML = s
      ? `<span class="dot"></span>${short(s.address)}${s.chainId ? ` <small>${chainName(s.chainId)}</small>` : ''}`
      : 'Connect Wallet';
    b.title = s ? 'Connected wallet' : '';
  });
  // explicit Disconnect button next to the address pill
  document.querySelectorAll<HTMLElement>('.nav-actions').forEach((box) => {
    let d = box.querySelector<HTMLButtonElement>('[data-disconnect]');
    if (!d) {
      d = document.createElement('button');
      d.type = 'button';
      d.className = 'btn btn-ghost btn-sm';
      d.setAttribute('data-disconnect', '');
      d.textContent = 'Disconnect';
      box.appendChild(d);
    }
    d.hidden = !s;
  });
  // the app is wallet-gated
  document.body.classList.toggle('locked', IS_APP && !s);
}
const IS_APP = document.body.classList.contains('app');
if (IS_APP) document.body.classList.add('locked');

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-disconnect]')) { void wallet.disconnect(); return; }
  const c = t.closest<HTMLElement>('[data-connect]');
  if (c) { if (!wallet.state) open(); return; }
  // Launch App links: only wallets get in
  const l = t.closest<HTMLAnchorElement>('a[href="app.html"]');
  if (l && !IS_APP) {
    e.preventDefault();
    await wallet.ready;
    if (wallet.state) { location.href = 'app.html'; return; }
    pendingLaunch = true;
    open();
  }
});
let pendingLaunch = false;
wallet.addEventListener('change', () => {
  paint();
  if (pendingLaunch && wallet.state) { pendingLaunch = false; location.href = 'app.html'; }
});
paint();
void wallet.restore();

(window as any).GT_OPEN_WALLET = open;
