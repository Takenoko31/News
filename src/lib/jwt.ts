/**
 * JWT ユーティリティ（Web Crypto API ベース、外部ライブラリ不使用）
 * アルゴリズム: HS256
 */

const encoder = new TextEncoder();

function base64url(input: string): string;
function base64url(input: ArrayBuffer): string;
function base64url(input: string | ArrayBuffer): string {
  const str =
    typeof input === 'string'
      ? btoa(input)
      : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export interface JwtPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

/** JWT を生成（有効期限: expiresInSec 秒） */
export async function signJwt(
  payload: { sub: string; role: string },
  secret: string,
  expiresInSec: number = 3600,
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSec,
  };
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const data = `${header}.${payloadB64}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${base64url(sig)}`;
}

/** JWT を検証し、ペイロードを返す。無効なら null */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);

  // 署名をバイナリに戻す
  const sigStr = base64urlDecode(signatureB64);
  const sigBuf = new Uint8Array(sigStr.length);
  for (let i = 0; i < sigStr.length; i++) {
    sigBuf[i] = sigStr.charCodeAt(i);
  }

  const valid = await crypto.subtle.verify('HMAC', key, sigBuf, encoder.encode(data));
  if (!valid) return null;

  const payload: JwtPayload = JSON.parse(base64urlDecode(payloadB64));

  // 有効期限チェック
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}
