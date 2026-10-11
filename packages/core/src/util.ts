/** Small isomorphic helpers (Node 20+ and browsers): hex / base64url / randomness. */

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const fromHex = (h: string): Uint8Array => {
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
export const randomHex = (n: number): string => toHex(randomBytes(n));

export const b64uEncode = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const b64uDecode = (s: string): Uint8Array => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
export const jsonB64u = (o: unknown): string => b64uEncode(utf8(JSON.stringify(o)));
export const parseJsonB64u = <T = unknown>(s: string): T => JSON.parse(new TextDecoder().decode(b64uDecode(s))) as T;

export async function sha256Hex(s: string | Uint8Array): Promise<string> {
  const data = typeof s === 'string' ? utf8(s) : s;
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource)));
}
