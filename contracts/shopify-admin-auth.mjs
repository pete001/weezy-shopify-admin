// Credentials stay on the service. Only this fixed merchant endpoint receives them.
export function createAdminTokenProvider({
  token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  clientID = process.env.SHOPIFY_ADMIN_CLIENT_ID,
  clientSecret = process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
  fetcher = fetch,
  now = Date.now,
} = {}) {
  let cached, expiresAt = 0, pending;
  return async function getToken() {
    if (token) return token; // Existing legacy installations remain supported.
    if (!clientID || !clientSecret) throw Object.assign(new Error('Club data deletion is being connected. Please try again shortly.'), {status:503});
    if (cached && now() < expiresAt - 60000) return cached;
    if (!pending) pending = (async () => {
      const response = await fetcher('https://weezypopshop.myshopify.com/admin/oauth/access_token', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'client_credentials',client_id:clientID,client_secret:clientSecret}),
        redirect:'error', signal:AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Shopify authentication unavailable');
      const body = await response.json();
      if (typeof body.access_token !== 'string' || !body.access_token || !Number.isFinite(body.expires_in) || body.expires_in <= 60) throw new Error('Shopify authentication unavailable');
      cached = body.access_token;
      expiresAt = now() + body.expires_in * 1000;
      return cached;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
