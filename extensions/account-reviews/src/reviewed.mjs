// Which products the signed-in customer has already reviewed in Judge.me, asked of the app service (pete001/weezy-app),
// which holds Judge.me's private key. The blocks send Shopify's session token for this customer; the service reads the
// customer from it. Nothing customer-related is logged here.
//
//   GET {APP_SERVICE_URL}/v1/account/reviewed   Authorization: Bearer <session token>
//   200 {"productIds": ["gid://shopify/Product/123", ...]}, 401, 503 {"error": "reviews_unavailable"}
//
// Any answer but a well-formed 200, within REVIEWED_TIMEOUT_MS, gives null: "not known", and the blocks fall back.
// The service is named in one place only (the App Editor's app-service.mjs); this imports it from there.
import {APP_SERVICE_URL} from '../../app-images/src/app-service.mjs';

export const REVIEWED_URL = `${APP_SERVICE_URL}/v1/account/reviewed`;
export const REVIEWED_TIMEOUT_MS = 5000;

const PRODUCT_ID = /^gid:\/\/shopify\/Product\/\d{1,30}$/;
const MAX_IDS = 5000;

// The service's 200 body as a Set of product IDs, or null if it is not exactly the agreed shape.
export function reviewedSet(body) {
  const ids = body?.productIds;
  if (!Array.isArray(ids) || ids.length > MAX_IDS) return null;
  if (!ids.every((id) => typeof id === 'string' && PRODUCT_ID.test(id))) return null;
  return new Set(ids);
}

// Settles within timeoutMs, token included, and never throws: a Set when known, null otherwise.
/**
 * @param {{fetchImpl: (url: string, init: any) => Promise<any>, getToken: () => Promise<string>, timeoutMs?: number, url?: string}} options
 * @returns {Promise<Set<string>|null>}
 */
export async function loadReviewed({fetchImpl, getToken, timeoutMs = REVIEWED_TIMEOUT_MS, url = REVIEWED_URL}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  const ask = async () => {
    const token = await getToken();
    if (typeof token !== 'string' || !token) return null;
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`},
      signal: controller?.signal,
    });
    if (!response || response.status !== 200) return null;
    return reviewedSet(await response.json());
  };
  try {
    return await Promise.race([
      ask(),
      new Promise((resolve) => {
        timer = setTimeout(() => { controller?.abort(); resolve(null); }, timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
