import test from 'node:test';
import assert from 'node:assert/strict';
import { Mint, TokenWallet, split, usdcToUnits, buildChallenge, encodePayment, verifyPayment, MintError } from '../src/index.ts';

const fresh = () => Mint.create();

test('split makes canonical change', () => {
  assert.deepEqual(split(66), [50, 10, 5, 1]);
  assert.deepEqual(split(993), [500, 200, 200, 50, 20, 20, 2, 1]);
  assert.equal(usdcToUnits(0.01), 10);
  assert.equal(usdcToUnits(0.0004), 1);
});

test('deposit -> blind issue -> spend -> settle', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx1', depositor: 'alice', units: 1000 });
  const w = new TokenWallet(mint);
  await w.mintFromClaim(claim.id, 1000);
  assert.equal(w.balance(), 1000);

  const seller = await mint.registerSeller('api', { chain: 'solana', address: 'SELLER' });
  const pay = await w.take(10);
  assert.equal(pay.reduce((a, t) => a + t.d, 0), 10);
  const r = await mint.spend(seller.secret, pay);
  assert.equal(r.units, 10);
  assert.equal(w.balance(), 990);

  const payout = await mint.settle(seller.secret);
  assert.equal(payout?.units, 10);
  assert.equal(await mint.settle(seller.secret), null);

  // chain-visible ledger: one deposit and one payout, nothing per-call
  const led = await mint.ledger();
  assert.deepEqual(led.map((e) => e.kind), ['deposit', 'payout']);
});

test('double spend is rejected', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx2', depositor: 'a', units: 100 });
  const w = new TokenWallet(mint);
  await w.mintFromClaim(claim.id, 100);
  const s = await mint.registerSeller('s', { chain: 'solana', address: 'X' });
  const pay = await w.take(50);
  await mint.spend(s.secret, pay);
  await assert.rejects(mint.spend(s.secret, pay), (e: MintError) => e.code === 'double_spend');
});

test('concurrent double spend: exactly one wins', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx3', depositor: 'a', units: 100 });
  const w = new TokenWallet(mint);
  await w.mintFromClaim(claim.id, 100);
  const s = await mint.registerSeller('s', { chain: 'solana', address: 'X' });
  const pay = await w.take(100);
  const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => mint.spend(s.secret, pay)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await mint.sellerBalance(s.secret)).balance, 100);
});

test('forged token is rejected', async () => {
  const mint = await fresh();
  const s = await mint.registerSeller('s', { chain: 'solana', address: 'X' });
  const fake = { d: 10, m: 'ab'.repeat(32), s: 'cd'.repeat(256) };
  await assert.rejects(mint.spend(s.secret, [fake]), (e: MintError) => e.code === 'bad_signature');
  // and it must not leave the token marked spent
  await assert.rejects(mint.spend(s.secret, [fake]), (e: MintError) => e.code === 'bad_signature');
});

test('token minted for one denomination cannot be relabelled', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx4', depositor: 'a', units: 1 });
  const w = new TokenWallet(mint);
  await w.mintFromClaim(claim.id, 1);
  const s = await mint.registerSeller('s', { chain: 'solana', address: 'X' });
  const [t] = w.tokens;
  await assert.rejects(mint.spend(s.secret, [{ ...t, d: 1000 }]), (e: MintError) => e.code === 'bad_signature');
});

test('cannot issue more than deposited; claims are single-use per tx', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx5', depositor: 'a', units: 10 });
  const w = new TokenWallet(mint);
  await assert.rejects(w.mintFromClaim(claim.id, 11), (e: MintError) => e.code === 'insufficient_claim');
  await w.mintFromClaim(claim.id, 10);
  await assert.rejects(w.mintFromClaim(claim.id, 1), (e: MintError) => e.code === 'insufficient_claim');
  assert.throws(() => mint.createClaim({ chain: 'dev', txid: 'tx5', depositor: 'a', units: 10 }), (e: MintError) => e.code === 'already_claimed');
});

test('wallet makes change via swap', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx6', depositor: 'a', units: 1000 });
  const w = new TokenWallet(mint);
  await w.mintFromClaim(claim.id, 1000); // a single 1000 token
  assert.equal(w.tokens.length, 1);
  const pay = await w.take(7);
  assert.equal(pay.reduce((a, t) => a + t.d, 0), 7);
  assert.equal(w.balance(), 993);
});

test('x402 envelope end to end', async () => {
  const mint = await fresh();
  const claim = mint.createClaim({ chain: 'dev', txid: 'tx7', depositor: 'a', units: 100 });
  const w = new TokenWallet(mint);
  await w.mintFromClaim(claim.id, 100);
  const s = await mint.registerSeller('s', { chain: 'solana', address: 'X' });
  const ch = buildChallenge({ units: 10, sellerId: s.sellerId, resource: 'http://x/y' });
  assert.equal(ch.accepts[0].maxAmountRequired, '10');
  const header = encodePayment(await w.take(10));
  assert.deepEqual(await verifyPayment(mint, s.secret, header, 10), { ok: true, units: 10 });
  const again = await verifyPayment(mint, s.secret, header, 10);
  assert.equal(again.ok, false);
  const low = await verifyPayment(mint, s.secret, encodePayment(await w.take(5)), 10);
  assert.equal(low.ok, false);
});

test('state survives a restart', async () => {
  const a = await fresh();
  const claim = a.createClaim({ chain: 'dev', txid: 'tx8', depositor: 'a', units: 10 });
  const w = new TokenWallet(a);
  await w.mintFromClaim(claim.id, 10);
  const snapshot = JSON.parse(JSON.stringify(a.state));
  const b = await Mint.create({ state: snapshot });
  const s = await b.registerSeller('s', { chain: 'solana', address: 'X' });
  const w2 = new TokenWallet(b, w.tokens);
  const r = await b.spend(s.secret, await w2.take(10));
  assert.equal(r.units, 10);
});

test('fast CRT signer matches the reference library', async () => {
  const { RSABSSA } = await import('@cloudflare/blindrsa-ts');
  const kp = await RSABSSA.SHA384.generateKey({ modulusLength: 2048, publicExponent: Uint8Array.from([1, 0, 1]) });
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const { parsePrivateJwk, rawSign, suite } = await import('../src/index.ts');
  const { blindedMsg } = await suite.blind(kp.publicKey, crypto.getRandomValues(new Uint8Array(32)));
  const ref = await suite.blindSign(kp.privateKey, blindedMsg);
  const fast = rawSign(parsePrivateJwk(jwk), blindedMsg);
  assert.deepEqual(Buffer.from(fast), Buffer.from(ref));
});
