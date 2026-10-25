// Web Push (RFC 8030 + VAPID RFC 8292 + cifratura aes128gcm RFC 8291) con la sola
// WebCrypto: nessuna dipendenza esterna. Provata contro la libreria di riferimento http_ece.

const enc = new TextEncoder();

export function b64uToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64u(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}

/** Cifra il messaggio per la sottoscrizione (RFC 8291, un solo record). */
export async function cifraPayload(
  uaPublicB64u: string,
  authB64u: string,
  payload: Uint8Array,
  opzioni: { salt?: Uint8Array; asPrivateJwk?: JsonWebKey; asPublicRaw?: Uint8Array } = {}
): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(uaPublicB64u);
  const authSecret = b64uToBytes(authB64u);

  let asPriv: CryptoKey;
  let asPublic: Uint8Array;
  if (opzioni.asPrivateJwk && opzioni.asPublicRaw) {
    asPriv = await crypto.subtle.importKey("jwk", opzioni.asPrivateJwk, { name: "ECDH", namedCurve: "P-256" }, false, [
      "deriveBits",
    ]);
    asPublic = opzioni.asPublicRaw;
  } else {
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPriv = kp.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  }

  const uaKey = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPriv, 256));

  const salt = opzioni.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const padded = concat(payload, new Uint8Array([2])); // 0x02 = ultimo record
  const cifrato = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, padded as BufferSource)
  );

  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrato);
}

/** Intestazione VAPID (JWT ES256) per l'endpoint del servizio push. */
export async function intestazioneVapid(
  endpoint: string,
  subject: string,
  publicB64u: string,
  privateB64u: string,
  scadenzaSecondi = 12 * 3600
): Promise<string> {
  const pub = b64uToBytes(publicB64u);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: privateB64u,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const audience = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64u(
    enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + scadenzaSecondi, sub: subject }))
  );
  const firma = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`) as BufferSource)
  );
  return `vapid t=${header}.${claims}.${bytesToB64u(firma)}, k=${publicB64u}`;
}

export interface Sottoscrizione {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Invia una notifica. Ritorna lo status HTTP del servizio push (404/410 = sottoscrizione scaduta). */
export async function inviaPush(
  sub: Sottoscrizione,
  messaggio: { titolo: string; corpo: string; url?: string },
  vapid: { subject: string; publicKey: string; privateKey: string }
): Promise<number> {
  const payload = enc.encode(JSON.stringify(messaggio));
  const body = await cifraPayload(sub.p256dh, sub.auth, payload);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await intestazioneVapid(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "normal",
    },
    body: body as BufferSource,
  });
  await res.body?.cancel();
  return res.status;
}
