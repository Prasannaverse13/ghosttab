import type { Chain, LedgerEvent, MintApi, Token } from '@ghosttab/core';
import { GhostAgent, HttpMint } from '@ghosttab/sdk';
import { wallet, short } from './wallets.js';

// ---------------------------------------------------------------- config
const APIS = [
  { path: '/price', name: 'PriceFeed', price: 0.005, units: 5, blurb: 'SOL/USD spot price' },
  { path: '/sentiment', name: 'SentimentPulse', price: 0.005, units: 5, blurb: 'Crypto Fear & Greed index' },
  { path: '/fees', name: 'FeeRadar', price: 0.01, units: 10, blurb: 'Solana priority fees' },
];
const STORE = 'gt.tokens';

type FundChain = 'solana' | 'tempo' | 'ethereum' | 'zcash';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (units: number) => '$' + (units / 1000).toFixed(units >= 1000 ? 2 : 3);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toast(msg: string, isErr = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout((toast as any)._t);
  (toast as any)._t = setTimeout(() => (t.hidden = true), isErr ? 6000 : 3000);
}

// ---------------------------------------------------------------- state
let mint: MintApi;
let http: HttpMint;
let agent: GhostAgent;
let chain: FundChain = 'solana';
let apiBase = '';
let fundedFrom = '';
let plainRows: { from: string; api: (typeof APIS)[number] }[] = [];
let busy = false;
let liveInfo: any = null;
let pollTimer: number | undefined;

const isEvm = (c: FundChain) => c === 'tempo' || c === 'ethereum';
function addressFor(c: FundChain): string {
  const w = wallet.state;
  return w && ((isEvm(c) && w.kind === 'metamask') || (c === 'solana' && w.kind === 'phantom')) ? w.address : (w?.address ?? '');
}

// ---------------------------------------------------------------- the mint: always a real server
const saved = (): Token[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? '[]'); } catch { return []; } };
const persistTokens = () => { try { localStorage.setItem(STORE, JSON.stringify(agent.wallet.toJSON())); } catch { /* storage blocked */ } };

async function connectMint(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const base = (q.get('mint') ?? location.origin).replace(/\/$/, '');
  const res = await fetch(base + '/v1/info');
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok || !ct.includes('json')) throw new Error('not a GhostTab mint');
  liveInfo = await res.json();
  if (!liveInfo?.unitMicroUsdc) throw new Error('not a GhostTab mint');
  http = new HttpMint(base);
  mint = http;
  apiBase = (q.get('api') ?? `${base}/demo`).replace(/\/$/, '');
  agent = makeAgent((u, i) => fetch(u, i));
}

function makeAgent(fetchImpl: typeof fetch): GhostAgent {
  return new GhostAgent({
    mint, fetchImpl, maxUnitsPerCall: 100, tokens: saved(),
    onPayment: (e) => {
      const pn = new URL(e.url).pathname;
      const api = APIS.find((a) => pn === a.path || pn.endsWith(a.path));
      if (!api) return;
      plainRows.push({ from: fundedFrom, api });
      logLine(`<span class="pay">402</span> ${esc(api.path)} → paid ${e.units} units → <span class="ok">200</span>`);
      persistTokens();
      renderTokens();
      renderPlain();
    },
  });
}

// ---------------------------------------------------------------- rendering
function renderTokens() {
  const toks: Token[] = agent.wallet.tokens;
  const by = new Map<number, number>();
  for (const t of toks) by.set(t.d, (by.get(t.d) ?? 0) + 1);
  const bal = agent.balance();
  $('bal').textContent = '$' + (bal / 1000).toFixed(2);
  $('bal-units').textContent = `${bal} units`;
  $('toks').innerHTML = toks.length
    ? [...by.entries()].sort((a, b) => b[0] - a[0]).map(([d, n]) => `<span class="tok" title="${n} × ${d} units"><b>${d}</b><small>×${n}</small></span>`).join('')
    : '<span class="empty">Nothing yet. Deposit to mint tokens.</span>';
}

function logLine(html: string, cls = '') {
  const log = $('log');
  if (log.querySelector('.muted')) log.innerHTML = '';
  const li = document.createElement('li');
  if (cls) li.className = cls;
  li.innerHTML = html;
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

function renderPlain() {
  $('plain-count').textContent = String(plainRows.length);
  $('plain-rows').innerHTML = plainRows.length
    ? plainRows.slice(-30).reverse().map((r) => `<li><span>${esc(short(r.from))} → ${esc(r.api.name)}</span><span>${money(r.api.units)}</span></li>`).join('')
    : '<li class="muted">No calls yet.</li>';
  if (!plainRows.length) return void ($('plain-infer').innerHTML = '');
  const n = new Map<string, number>();
  for (const r of plainRows) n.set(r.api.name, (n.get(r.api.name) ?? 0) + 1);
  $('plain-infer').innerHTML = `<b>An observer reads:</b> wallet <b>${esc(short(fundedFrom))}</b> buys ${[...n].map(([k, v]) => `${esc(k)} ×${v}`).join(', ')}. That is a trading bot, and its exact data diet.`;
}

async function renderLedger() {
  let led: LedgerEvent[] = [];
  try { led = await mint.ledger(); } catch { return; }
  $('ghost-count').textContent = String(led.length);
  $('ghost-rows').innerHTML = led.length
    ? led.slice().reverse().map((e) => e.kind === 'deposit'
        ? `<li><span><span class="tag">deposit</span>${esc(short(e.from))} → mint</span><span>${money(e.units)}</span></li>`
        : `<li><span><span class="tag">payout</span>mint → ${esc(e.sellerName)}</span><span>${money(e.units)}</span></li>`).join('')
    : '<li class="muted">No deposit yet.</li>';
  if (!led.length) return void ($('ghost-infer').innerHTML = '');
  const dep = led.filter((e) => e.kind === 'deposit').reduce((a, e) => a + e.units, 0);
  const pay = led.filter((e) => e.kind === 'payout').length;
  $('ghost-infer').innerHTML = `<b>An observer reads:</b> someone deposited ${money(dep)}${pay ? `, and ${pay} seller${pay > 1 ? 's' : ''} received batched payouts` : ''}. Nothing says who bought what, or how often.`;
}

// ---------------------------------------------------------------- actions
async function deposit() {
  if (busy) return;
  const usdc = parseFloat(($('amount') as HTMLInputElement).value);
  if (!(usdc >= 0.1 && usdc <= 100)) return toast('Enter an amount between 0.1 and 100 USDC.', true);
  busy = true;
  const btn = $('deposit');
  btn.setAttribute('disabled', '');
  try {
    if (chain === 'zcash') throw new Error('Shielded Zcash deposits are on the roadmap.');
    const cfg = liveInfo?.chains?.[chain];
    if (!cfg?.enabled || !cfg.depositAddress) throw new Error(`${chain} deposits are not configured on this mint.`);
    if (!wallet.state || (isEvm(chain) ? wallet.state.kind !== 'metamask' : wallet.state.kind !== 'phantom')) {
      (window as any).GT_OPEN_WALLET?.();
      throw new Error(isEvm(chain) ? 'Connect MetaMask to deposit on ' + chain : 'Connect Phantom to deposit on Solana');
    }
    fundedFrom = wallet.state.address;
    note('Confirm the USDC transfer in your wallet…');
    const txid = chain === 'solana'
      ? await wallet.sendSolanaUsdc({ to: cfg.depositAddress, usdcMint: cfg.usdcMint, usdc, rpc: liveInfo.solanaRpc })
      : await wallet.sendEvmUsdc({ to: cfg.depositAddress, token: cfg.usdc, usdc, chainId: cfg.chainId, add: cfg.rpc ? { name: cfg.name, rpc: cfg.rpc, explorer: cfg.explorer } : undefined });
    note('Deposit confirmed on-chain. Sign to prove it is yours (free, no gas)…');
    const sig = await wallet.signClaim(chain as 'solana' | 'ethereum' | 'tempo', txid);
    note('Mint is verifying the deposit…');
    let r: { claimId: string; units: number } | undefined;
    for (let i = 0; i < 12 && !r; i++) {
      try { r = await http.claim(chain as Chain, txid, sig); } catch (e: any) {
        if (e?.code !== 'tx_not_found') throw e; // the mint's RPC may lag a few seconds behind your wallet's
        await sleep(2000);
      }
    }
    if (!r) throw new Error('The mint cannot see your deposit yet. Wait a moment and retry the claim.');
    note('Blinding and signing tokens…');
    await agent.fund(r.claimId, r.units);
    persistTokens();
    renderTokens();
    await renderLedger();
    note(`${money(r.units)} of blind credit minted. The mint can't tell which tokens are yours.`);
    toast('Deposit verified');
  } catch (e: any) {
    note('');
    toast(e?.code === 4001 ? 'Request declined in wallet.' : e?.message ?? 'Deposit failed', true);
  } finally {
    busy = false;
    btn.removeAttribute('disabled');
  }
}

function note(t: string) { $('deposit-note').textContent = t; }

async function runAgent() {
  if (busy) return;
  const rounds = Number(($('rounds') as HTMLSelectElement).value);
  const need = rounds * APIS.reduce((a, x) => a + x.units, 0);
  if (agent.balance() < need) return toast(`Fund the tab first: ${rounds} round${rounds > 1 ? 's' : ''} costs ${money(need)}.`, true);
  busy = true;
  $('run').setAttribute('disabled', '');
  $('log').innerHTML = '';
  try {
    for (let r = 0; r < rounds; r++) {
      for (const api of APIS) {
        logLine(`GET ${esc(api.path)}`);
        const res = await agent.fetch(apiBase + api.path);
        if (!res.ok) throw new Error(`${api.path} returned ${res.status}`);
        await sleep(280);
      }
    }
    logLine(`Done. ${rounds * APIS.length} calls, ${money(need)} spent.`);
    await renderLedger();
  } catch (e: any) {
    toast(e?.message ?? 'Agent run failed', true);
  } finally {
    busy = false;
    $('run').removeAttribute('disabled');
    persistTokens();
    renderTokens();
  }
}

async function settle() {
  const b = $('settle');
  b.setAttribute('disabled', '');
  try {
    const r = await fetch(apiBase + '/settle', { method: 'POST' });
    if (!r.ok) throw new Error(`settlement failed (${r.status})`);
    const paid: { seller: string; units: number; txid?: string }[] = await r.json();
    await renderLedger();
    toast(paid.length ? `Settled ${paid.length} seller${paid.length > 1 ? 's' : ''}: one on-chain payout each.` : 'Nothing to settle yet.');
  } catch (e: any) {
    toast('Could not reach the demo APIs. Start them with: npm run demo:apis', true);
  } finally {
    b.removeAttribute('disabled');
  }
}

/** Clears the on-screen log and the plain-x402 comparison. Your tokens are real money and are kept. */
function clearView() {
  if (busy) return;
  plainRows = [];
  $('log').innerHTML = '<li class="muted">Waiting for the first call…</li>';
  renderPlain();
}

function selectChain(c: FundChain) {
  chain = c;
  document.querySelectorAll<HTMLElement>('#chains .chip').forEach((el) => {
    const on = el.dataset.chain === c;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
  });
  $('zbox').hidden = c !== 'zcash';
  paintDepositBtn();
  const net = c === 'solana' ? liveInfo?.chains?.solana?.network : (c === 'ethereum' || c === 'tempo') ? liveInfo?.chains?.[c]?.name : '';
  note(c === 'zcash' ? '' : net ? `Network: ${c === 'solana' ? 'Solana ' : ''}${net}. Real USDC transfer from your wallet.` : '');
}

function paintDepositBtn() {
  const b = $('deposit');
  const off = chain !== 'zcash' && !liveInfo?.chains?.[chain]?.enabled;
  b.textContent = chain === 'zcash' ? 'Zcash: roadmap' : off ? `${chain[0].toUpperCase() + chain.slice(1)} not set up on this mint` : isEvm(chain) ? 'Deposit with MetaMask' : 'Deposit with Phantom';
  b.toggleAttribute('disabled', chain === 'zcash' || off || busy);
}

// ---------------------------------------------------------------- boot
function starbursts() {
  const rays = Array.from({ length: 12 }, (_, i) => `<rect x="22.6" y="2" width="2.8" height="44" rx="1.4" transform="rotate(${i * 15} 24 24)"/>`).join('');
  document.querySelectorAll('.burst').forEach((b) => { b.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48" fill="currentColor" aria-hidden="true">${rays}<circle cx="24" cy="24" r="5"/></svg>`; });
}

async function boot() {
  starbursts();
  $('chains').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('.chip'); if (b) selectChain(b.dataset.chain as FundChain); });
  $('deposit').addEventListener('click', () => void deposit());
  $('run').addEventListener('click', () => void runAgent());
  $('settle').addEventListener('click', () => void settle());
  $('reset').addEventListener('click', clearView);
  wallet.addEventListener('change', () => { if (agent && agent.balance() === 0) fundedFrom = addressFor(chain); });

  try {
    await connectMint();
  } catch {
    $('app-error').hidden = false;
    $('app-error').textContent = 'Cannot reach the GhostTab mint. Start it with `npm run dev` and open this page from http://localhost:8402/app.html.';
    ['deposit', 'run', 'settle'].forEach((id) => $(id).setAttribute('disabled', ''));
    return;
  }
  fundedFrom = addressFor(chain);
  selectChain('solana');
  renderTokens(); renderPlain(); await renderLedger();
  pollTimer = window.setInterval(() => void renderLedger(), 2500);
}

// Wallet-gated: nothing starts until a wallet is connected.
void (async () => {
  await wallet.ready;
  if (!wallet.state) await new Promise<void>((res) => { const f = () => { if (wallet.state) { wallet.removeEventListener('change', f); res(); } }; wallet.addEventListener('change', f); });
  await boot();
})();
void pollTimer;
