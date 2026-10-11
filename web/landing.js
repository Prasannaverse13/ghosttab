(() => {
  const { ghostSVG, coinSVG, CAST, RARE, MASKED, FOOTER } = window.GT;
  const $ = (s) => document.querySelector(s);

  // Gallery: two rows, content doubled for a seamless loop
  const rows = [CAST.slice(0, 7), CAST.slice(7)];
  document.querySelectorAll('.marquee').forEach((el) => {
    const set = rows[+el.dataset.row];
    const cards = [...set, ...set.slice().reverse(), ...set];
    const html = cards.map((v) => `<div class="portrait">${ghostSVG(v)}</div>`).join('');
    el.innerHTML = html + html;
  });

  // Ticker
  const ticks = ['1 deposit', 'zero trail', 'x402 native', 'solana · tempo · ethereum · zcash'];
  const tickHTML = ticks.map((t) => `<span class="tick">${t}<i></i></span>`).join('');
  $('#ticker').innerHTML = tickHTML.repeat(12);

  // Coins
  const coins = [['sol', 'Solana'], ['tempo', 'Tempo'], ['eth', 'Ethereum'], ['zec', 'Zcash']];
  $('#coins').innerHTML = coins.map(([k, n]) => `<figure>${coinSVG(k)}<figcaption>${n}</figcaption></figure>`).join('');

  // Feature figures
  $('#rare').innerHTML = ghostSVG(RARE, { w: 380, h: 400, label: 'Charcoal ghost in sunglasses wearing a 402 coin', fit: 'xMidYMax meet' });
  $('#masked').innerHTML = ghostSVG(MASKED, { w: 560, h: 512, label: 'Ghost in a bucket hat and privacy mask', fit: 'xMidYMid meet' });
  $('#footer-ghost').innerHTML = ghostSVG(FOOTER, { w: 480, h: 523, label: 'Ghost in a green cap and tie', fit: 'xMidYMax meet' });

  // Starburst dingbats
  const rays = Array.from({ length: 12 }, (_, i) => `<rect x="22.6" y="2" width="2.8" height="44" rx="1.4" transform="rotate(${i * 15} 24 24)"/>`).join('');
  document.querySelectorAll('.burst').forEach((b) => { b.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48" fill="currentColor" aria-hidden="true">${rays}<circle cx="24" cy="24" r="5"/></svg>`; });

  // Steps
  const steps = [
    { v: CAST[4], t: 'Fund the tab', d: 'Your agent deposits once on Solana, Tempo, Ethereum or Zcash. That deposit is the only thing that ever lands on chain.' },
    { v: CAST[6], t: 'Blind-mint credit', d: 'The mint signs blinded tokens. It knows a deposit happened, but it can never recognise the tokens it signed.' },
    { v: CAST[1], t: 'Hit a paid API', d: 'The API answers <code>402 Payment Required</code> with a price, exactly like standard x402.' },
    { v: CAST[11], t: 'Pay with a token', d: 'The agent retries with <code>X-PAYMENT: &lt;token&gt;</code>. The seller checks the signature and spent-list, then returns 200 OK.' },
    { v: CAST[13], t: 'Seller settles', d: 'Sellers redeem tokens in batches for USDC on Solana. There\'s no per-call receipt anywhere.' },
  ];
  $('#steps').innerHTML = steps.map((s, i) => `
    <article class="step">
      <div class="step-art">${ghostSVG(s.v, { w: 500, h: 640 })}</div>
      <div class="step-meta">
        <span class="step-num">0${i + 1}</span>
        <div><h3>${s.t}</h3><p>${s.d}</p></div>
      </div>
    </article>`).join('');

  const track = $('#steps');
  const stepW = () => track.querySelector('.step').getBoundingClientRect().width + 30;
  $('#prev').addEventListener('click', () => track.scrollBy({ left: -stepW(), behavior: 'smooth' }));
  $('#next').addEventListener('click', () => track.scrollBy({ left: stepW(), behavior: 'smooth' }));

  // Mobile menu
  const burger = $('#burger'), menu = $('#mobile-menu');
  burger.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
  });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) { menu.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });

})();
