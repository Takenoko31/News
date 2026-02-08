/**
 * フィンガープリント生成
 *
 * IPアドレス・User-Agent・Accept-Language から HMAC-SHA256 ハッシュを生成。
 * 生のIPは保存せず、ハッシュのみ保存することで個人情報保持を回避しつつ
 * 連投制限を実現する。
 */

const encoder = new TextEncoder();

export async function generateFingerprint(
  secret: string,
  ip: string,
  userAgent: string,
  acceptLanguage: string,
): Promise<string> {
  const data = `${ip}|${userAgent}|${acceptLanguage}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** リクエストからフィンガープリントを生成 */
export async function fingerprintFromRequest(
  secret: string,
  request: Request,
): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
  const ua = request.headers.get('user-agent') || '';
  const lang = request.headers.get('accept-language') || '';
  return generateFingerprint(secret, ip, ua, lang);
}
