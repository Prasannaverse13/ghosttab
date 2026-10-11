import{a as h,b as f,c as d,d as c,e as n}from"./chunk-NPCN6N7J.js";import"./chunk-DGJUBN33.js";var s=document.createElement("div");s.className="modal";s.hidden=!0;s.innerHTML=`
  <div class="modal-scrim" data-close></div>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mtitle">
    <button class="modal-x" type="button" aria-label="Close" data-close>\xD7</button>
    <span class="burst-s" aria-hidden="true">\u273A</span>
    <h2 id="mtitle">Connect a <em>wallet</em></h2>
    <p class="modal-sub">No account, no sign-up. Your wallet is your identity.</p>
    <button class="wopt" type="button" data-kind="metamask">
      <span class="wopt-ico" style="background:#f6851b">\u{1F98A}</span>
      <span><b>MetaMask</b><small>Ethereum and Tempo</small></span>
      <i class="wopt-state"></i>
    </button>
    <button class="wopt" type="button" data-kind="phantom">
      <span class="wopt-ico" style="background:#ab9ff2">\u{1F47B}</span>
      <span><b>Phantom</b><small>Solana</small></span>
      <i class="wopt-state"></i>
    </button>
    <div class="wopt wopt-off">
      <span class="wopt-ico" style="background:#efc23a">Z</span>
      <span><b>Zcash</b><small>No browser wallet: deposits go to a shielded address in the app</small></span>
    </div>
    <p class="modal-err" role="alert" hidden></p>
  </div>`;document.body.appendChild(s);var l=s.querySelector(".modal-err"),i=()=>{s.hidden=!1,w(),s.querySelector(".wopt:not(.wopt-off)")?.focus()},r=()=>{s.hidden=!0,l.hidden=!0};function w(){let t={metamask:!!d(),phantom:!!c()};s.querySelectorAll(".wopt[data-kind]").forEach(a=>{let e=a.dataset.kind;a.querySelector(".wopt-state").textContent=t[e]?n.state?.kind===e?"Connected":"Detected":"Install"})}s.addEventListener("click",async t=>{let a=t.target;if(a.closest("[data-close]"))return r();let e=a.closest(".wopt[data-kind]");if(!e)return;let o=e.dataset.kind;if(!(o==="metamask"?d():c())){window.open(o==="metamask"?"https://metamask.io/download/":"https://phantom.com/download","_blank","noopener"),l.textContent=`${o==="metamask"?"MetaMask":"Phantom"} isn't installed in this browser. Install it, then reload.`,l.hidden=!1;return}try{e.disabled=!0,await n.connect(o),r()}catch(u){l.textContent=u?.code===4001?"Connection request was declined.":u?.message??"Could not connect.",l.hidden=!1}finally{e.disabled=!1}});document.addEventListener("keydown",t=>{t.key==="Escape"&&!s.hidden&&r()});var y=()=>document.querySelectorAll("[data-connect]");function b(){let t=n.state;y().forEach(a=>{a.classList.toggle("connected",!!t),a.innerHTML=t?`<span class="dot"></span>${h(t.address)}${t.chainId?` <small>${f(t.chainId)}</small>`:""}`:"Connect Wallet",a.title=t?"Connected wallet":""}),document.querySelectorAll(".nav-actions").forEach(a=>{let e=a.querySelector("[data-disconnect]");e||(e=document.createElement("button"),e.type="button",e.className="btn btn-ghost btn-sm",e.setAttribute("data-disconnect",""),e.textContent="Disconnect",a.appendChild(e)),e.hidden=!t}),document.body.classList.toggle("locked",p&&!t)}var p=document.body.classList.contains("app");p&&document.body.classList.add("locked");document.addEventListener("click",async t=>{let a=t.target;if(a.closest("[data-disconnect]")){n.disconnect();return}if(a.closest("[data-connect]")){n.state||i();return}if(a.closest('a[href="app.html"]')&&!p){if(t.preventDefault(),await n.ready,n.state){location.href="app.html";return}m=!0,i()}});var m=!1;n.addEventListener("change",()=>{b(),m&&n.state&&(m=!1,location.href="app.html")});b();n.restore();window.GT_OPEN_WALLET=i;
