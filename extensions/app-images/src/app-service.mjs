// The app service: the server the Weezy Pop iPhone app reads its catalogue, sets and checkout offers from.
// The editor only reads two public status endpoints from it (no credentials, no writes):
//   GET /v1/catalogue/sync          when the service last picked up the editor's saved metafields
//   GET /v1/set-checkout-status     whether app-only set offers can be switched on ({ready: true})
// It is the one place the editor names the service. Today it is the existing reader; when the new
// pete001/weezy-app service is live on its own Fly app, change APP_SERVICE_URL here and redeploy.
export const APP_SERVICE_URL = 'https://weezy-pop-club.fly.dev';
export const appServiceURL = path => APP_SERVICE_URL + path;
