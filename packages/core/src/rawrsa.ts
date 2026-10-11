/**
 * Fast RSA private-key operation (RSASP1) with CRT, using native BigInt.
 *
 * Blind signing is a raw RSA private operation on the blinded message. WebCrypto cannot do raw RSA and the
 * reference library falls back to a pure-JS bignum (~450 ms per signature at 2048 bits). CRT over native BigInt
 * is ~20x faster and works identically in Node and the browser.
 */
import { b64uDecode, toHex } from './util.js';

const big = (b64u: string): bigint => BigInt('0x' + (toHex(b64uDecode(b64u)) || '0'));

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return r;
}

export interface RsaPrivate {
  n: bigint; e: bigint; p: bigint; q: bigint; dp: bigint; dq: bigint; qi: bigint; k: number;
}

export function parsePrivateJwk(jwk: JsonWebKey): RsaPrivate {
  const { n, e, p, q, dp, dq, qi } = jwk as Record<string, string>;
  if (!n || !e || !p || !q || !dp || !dq || !qi) throw new Error('JWK is missing CRT parameters');
  const nn = big(n);
  return { n: nn, e: big(e), p: big(p), q: big(q), dp: big(dp), dq: big(dq), qi: big(qi), k: Math.ceil(nn.toString(2).length / 8) };
}

export function rawSign(key: RsaPrivate, message: Uint8Array): Uint8Array {
  const m = BigInt('0x' + (toHex(message) || '0'));
  if (message.length !== key.k || m >= key.n) throw new Error('blinded message out of range');
  const m1 = modPow(m, key.dp, key.p);
  const m2 = modPow(m, key.dq, key.q);
  let h = (key.qi * (m1 - m2)) % key.p;
  if (h < 0n) h += key.p;
  const s = m2 + h * key.q;
  // fault-attack guard: s^e must equal m
  if (modPow(s, key.e, key.n) !== m) throw new Error('RSA fault check failed');
  const hex = s.toString(16).padStart(key.k * 2, '0');
  const out = new Uint8Array(key.k);
  for (let i = 0; i < key.k; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
