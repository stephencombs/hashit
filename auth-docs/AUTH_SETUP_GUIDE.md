# Paycor OIDC Auth — Implementation Guide for a Fresh Application

**Audience:** An engineering agent with zero prior context on this codebase.
**Goal:** Stand up Paycor's OIDC/OAuth2 authentication in a new React (Vite) + Node (Express) application so it can securely call Paycor APIs through the API Management (APIm) gateway.

Follow the sections in order. Every file path below is relative to the new project root.

---

## 0. Background You Need Before Writing Code

This authentication model has five moving parts. Understand all of them before starting.

1. **Paycor STS** — The identity provider. Hosts `/sts/v1/common` (user implicit flow) and `/sts/v2/common/token` (client_credentials). Issues JWT access tokens.
2. **Paycor APIm** — The edge gateway. Every API call must include an `Ocp-Apim-Subscription-Key` header. Without the key, the gateway rejects the request before it ever reaches your backend.
3. **`paycor-oidc-client`** — A Paycor fork of `oidc-client-js`. Provides `UserManager` and a `User` object that exposes `access_token` and `hasPrivilege(id)`.
4. **`@paycor/yatti-react`** — A React wrapper providing `useAuthentication(userManagerSettings)` and a `<SessionTimeout />` component tied to Paycor HCM session state.
5. **Implicit grant** — This implementation uses `response_type: 'token'`. That is a deliberate choice dictated by the Paycor platform; do **not** substitute PKCE or auth-code without explicit approval.

**Key mental model:** the browser holds the user's access token. The backend is a *pass-through proxy* — it forwards the user's token (and other auth headers) on to APIm. The backend itself only mints a token directly when it needs machine-to-machine access (e.g., uploading static files at deploy time).

---

## 1. Prerequisites & Secrets Checklist

Before you write any code, obtain the following from the Paycor platform team:

| Variable | Example (dev) | Purpose |
|---|---|---|
| `OAUTH_CLIENT_ID` (frontend) | `TeammateAgentUI` | OIDC client registered for your SPA |
| `OAUTH_CLIENT_ID` (backend) | `TeammateService` | Confidential client for `client_credentials` |
| `OAUTH_CLIENT_SECRET` (backend) | `jY5Tl…` | Secret for backend client |
| `APIM_SUBSCRIPTION_KEY` | `255f5fdf122647269b56d805ebe65298` | APIm gateway key |
| `BASE_URL_API` (prod) | `api.paycor.com` | APIm host in production |
| `BASE_URL_HCM` (prod) | `hcm.paycor.com` | HCM host (redirect URIs, SessionTimeout) |
| `URL_PATH` | `teammate` | Your app's mount path under HCM |
| `ACCESS_PRIVILEGE_ID` | `2253` | Paycor privilege required to enter the app |

**Register two redirect URIs** with the STS team for your SPA client:
- `https://<hcmBaseUrl>/<urlPath>/oauth/silent_renew.html` (production)
- `https://local.paycor.com:3000/<urlPath>/oauth/silent_renew.html` (local dev)

**Local dev hostname:** OIDC enforces exact origin matching. You **must** run the dev server at `https://local.paycor.com:3000`, not `localhost`. Add to `/etc/hosts`:
```
127.0.0.1  local.paycor.com
```
and provision a self-signed cert (store at `./cert/_cert.pem`).

---

## 2. Project Layout

Create this structure:

```
<project>/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   └── oauth/
│   │       ├── silent_renew.html
│   │       ├── silent.html
│   │       └── oidc-client.rsa256.slim.min.js
│   └── src/
│       ├── app/main.tsx
│       ├── shared/
│       │   ├── config/appConfig.ts
│       │   ├── config/authenticationConfig.ts
│       │   ├── context/UserContextProvider.tsx
│       │   ├── api/index.ts
│       │   └── utils/userUtils.ts
│       └── features/forbidden/ForbiddenPage.tsx
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── errors.js
│   └── accessToken.js
└── cert/
    └── _cert.pem
```

---

## 3. Install Dependencies

### 3.1 Frontend

```bash
cd frontend
npm install react@^19 react-dom@^19 react-router@^7 react-router-dom@^7 \
  axios@^1.13 \
  @paycor/yatti-react@^3.0 \
  paycor-oidc-client \
  @tanstack/react-query@^5
npm install -D vite@^6 @vitejs/plugin-react @vitejs/plugin-basic-ssl typescript@^5 \
  @types/react @types/react-dom
```

**Note on `paycor-oidc-client`:** this is hosted in Paycor's private npm registry. Configure `.npmrc` with the Paycor registry URL and auth token before installing. If it cannot be found, stop and request registry access.

### 3.2 Backend

```bash
cd backend
npm install express@^4 cors@^2 axios@^1.13 cross-env@^7
```

---

## 4. Frontend Implementation

### 4.1 `src/shared/config/appConfig.ts`

Centralizes all environment-specific URLs and keys. Production values use Octopus-style `#{…}` tokens for deploy-time substitution.

```ts
const urlPath = import.meta.env.PROD ? '#{UrlPath}' : '<your-url-path>';

export const appConfig = {
  urlPath,
  apimSubscriptionKey: import.meta.env.PROD
    ? '#{Project-APIm-Key}'
    : '<DEV_APIM_SUBSCRIPTION_KEY>',
  hcmBaseUrl: import.meta.env.PROD
    ? '#{BaseURL-HCM}'
    : '//hcm-quarterly.paycor.com',
  apimBaseUrl: import.meta.env.PROD ? '#{BaseURL-API}' : '',
  oauthClientId: import.meta.env.DEV
    ? '<DEV_OAUTH_CLIENT_ID>'
    : '#{FrontEnd-Oauth-ClientID}',
};
```

### 4.2 `src/shared/config/authenticationConfig.ts`

This is the **exact shape** required by `UserManager`. Do not change `response_type` or add PKCE.

```ts
import { appConfig } from '@/shared/config/appConfig';

const userManagerSettings = {
  client_id: appConfig.oauthClientId,
  redirect_uri: import.meta.env.DEV
    ? `https://local.paycor.com:3000/${appConfig.urlPath}/oauth/silent_renew.html`
    : `${appConfig.hcmBaseUrl}/${appConfig.urlPath}/oauth/silent_renew.html`,
  response_type: 'token',                        // implicit grant — required
  scope: appConfig.oauthClientId,
  authority: import.meta.env.DEV
    ? '/sts/v1/common'                           // dev: Vite proxy rewrites this
    : '#{BaseURL-API}/sts/v1/common',
  silent_redirect_uri: import.meta.env.DEV
    ? `https://local.paycor.com:3000/${appConfig.urlPath}/oauth/silent_renew.html`
    : `${appConfig.hcmBaseUrl}/${appConfig.urlPath}/oauth/silent_renew.html`,
  automaticSilentRenew: true,
  filterProtocolClaims: true,
  loadUserInfo: true,
  includeIdTokenInSilentRenew: false,
  extraQueryParams: {
    'subscription-key': import.meta.env.DEV
      ? '<DEV_APIM_SUBSCRIPTION_KEY>'
      : '#{Project-APIm-Key}',
  },
};

export default userManagerSettings;
```

### 4.3 `public/oauth/silent_renew.html`

Loaded inside a hidden iframe during `automaticSilentRenew`. Keep it minimal — no bundler, no React.

```html
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Callback</title></head>
  <body>
    <script src="oidc-client.rsa256.slim.min.js"></script>
    <script>
      const userManagerConfig = {
        loadUserInfo: false,
        extraQueryParams: { "subscription-key": "#{Project-APIm-Key}" },
      };
      var mgr = new UserManager(userManagerConfig);
      mgr.signinSilentCallback();
    </script>
  </body>
</html>
```

### 4.4 `public/oauth/silent.html` (full redirect callback)

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title></title></head>
  <body>
    <script src="oidc-client.min.js"></script>
    <script>
      var userManager = new Oidc.UserManager();
      userManager.clearStaleState();
      userManager.signinRedirectCallback()
        .then(function () { window.location = "../"; })
        .catch(function (e) { console.error(e); });
    </script>
  </body>
</html>
```

### 4.5 `public/oauth/oidc-client.rsa256.slim.min.js`

Copy this asset from a Paycor reference app. It is the Paycor-built slim RSA256 variant of `oidc-client-js` — **do not** substitute the vanilla npm build.

### 4.6 `src/shared/context/UserContextProvider.tsx`

Exposes the user both via React context **and** via a module-level variable (needed so non-React code such as axios interceptors can read the token).

```tsx
import type { User } from 'paycor-oidc-client';
import { createContext, type ReactNode, useContext } from 'react';

interface UserContextType { user: User; }
const UserContext = createContext<UserContextType | undefined>(undefined);

let currentUser: User | null = null;

export const UserProvider = ({ user, children }: { user: User; children: ReactNode }) => {
  currentUser = user;                             // module-level escape hatch
  return <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
};

export const getCurrentUser = () => currentUser;
```

### 4.7 `src/shared/utils/userUtils.ts`

```ts
import { getCurrentUser } from '@/shared/context/UserContextProvider';
export function getUserId(): string | null {
  return (getCurrentUser()?.profile?.sub as string) ?? null;
}
```

### 4.8 `src/shared/api/index.ts` — authenticated axios factory

Every authenticated HTTP call in the app routes through this factory. It automatically attaches the bearer token, APIm key, and forwards cookies.

```ts
import axios from 'axios';
import { appConfig } from '@/shared/config/appConfig';
import { getCurrentUser } from '@/shared/context/UserContextProvider';

export const errorMessage_401 = 'unauthorized';
export const errorMessage_403 = 'forbidden';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Request failed with status code ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const getAxiosInstance = (endpoint = '') => {
  const user = getCurrentUser();
  const baseURL = endpoint === '/Accounts'
    ? `${appConfig.hcmBaseUrl}${endpoint}`
    : `${appConfig.apimBaseUrl}${endpoint}`;
  return axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user?.access_token}`,
      'Ocp-Apim-Subscription-Key': appConfig.apimSubscriptionKey,
    },
    withCredentials: true,
  });
};

// Wrap GET/POST/PUT/DELETE/PATCH to normalize 401/403 into sentinel errors.
// (See AUTH.md in the reference implementation for full method bodies.)
```

Error-handling contract every method must honor:
- `response.status === 401` → reject with `new Error(errorMessage_401)`.
- `response.status === 403` → reject with `new Error(errorMessage_403)`.
- Any other non-2xx → reject with `new HttpError(status)`.

### 4.9 `src/features/forbidden/ForbiddenPage.tsx`

Shown when the authenticated user lacks the required privilege. Use Paycor design system components if available; otherwise any simple 403 page is acceptable.

### 4.10 `src/app/main.tsx` — route gating + privilege enrichment

This is the heart of the flow. Copy it carefully.

```tsx
import { SessionTimeout, useAuthentication } from '@paycor/yatti-react';
import { type User, UserManager } from 'paycor-oidc-client';
import { StrictMode, useEffect, useReducer, useRef, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userManagerSettings from '@/shared/config/authenticationConfig';
import { appConfig } from '@/shared/config/appConfig';
import { UserProvider } from '@/shared/context/UserContextProvider';

const queryClient = new QueryClient();
const ACCESS_PRIVILEGE_ID = 2253;                 // from platform team

const App = lazy(() => import('./App'));
const ForbiddenPage = lazy(() => import('@/features/forbidden/ForbiddenPage'));
const FullPageLoader = () => <div>Loading…</div>;

const ProtectedApp = ({ user }: { user: User | null }) => {
  if (!user?.hasPrivilege(ACCESS_PRIVILEGE_ID)) return <ForbiddenPage />;
  return <Suspense fallback={<FullPageLoader />}><App /></Suspense>;
};

type EnrichState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; user: User };

function enrichReducer(state: EnrichState, a: { type: 'LOADING' } | { type: 'SUCCESS'; user: User }): EnrichState {
  if (a.type === 'LOADING') return { status: 'loading' };
  if (a.type === 'SUCCESS') return { status: 'ready', user: a.user };
  return state;
}

const AuthenticatedRoutes = () => {
  const { status: authStatus, user } = useAuthentication(userManagerSettings);
  const [enrichState, dispatch] = useReducer(enrichReducer, { status: 'idle' });

  // Clear query cache when the signed-in user changes.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = enrichState.status === 'ready'
      ? ((enrichState.user.profile?.sub as string) ?? null)
      : null;
    if (prevUserIdRef.current !== null && prevUserIdRef.current !== userId) {
      queryClient.clear();
    }
    prevUserIdRef.current = userId;
  }, [enrichState]);

  // Enrich the base OIDC user with Paycor privileges.
  useEffect(() => {
    if (authStatus === 'success' && user?.access_token) {
      dispatch({ type: 'LOADING' });
      const um = new UserManager(userManagerSettings);
      um.getUserByAccessToken(user.access_token)
        .then((result) => {
          if (result instanceof Error) {
            console.error('Failed to load privileges:', result);
            dispatch({ type: 'SUCCESS', user });         // fallback
          } else {
            dispatch({ type: 'SUCCESS', user: result });
          }
        })
        .catch((err) => {
          console.error('Failed to load privileges:', err);
          dispatch({ type: 'SUCCESS', user });           // fallback
        });
    }
  }, [authStatus, user]);

  if (authStatus === 'loading' || authStatus === 'idle'
      || enrichState.status === 'idle' || enrichState.status === 'loading') {
    return <FullPageLoader />;
  }

  if (authStatus === 'success' && enrichState.status === 'ready') {
    return (
      <UserProvider user={enrichState.user}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/*" element={<ProtectedApp user={enrichState.user} />} />
          </Routes>
        </QueryClientProvider>
      </UserProvider>
    );
  }
  return null;
};

const Root = () => (
  <>
    <SessionTimeout
      APIm={appConfig.apimSubscriptionKey}
      applicationUrl={appConfig.hcmBaseUrl}
      refreshUrl={`${appConfig.hcmBaseUrl}/accounts/`}
    />
    <BrowserRouter basename={appConfig.urlPath}>
      <Suspense fallback={null}>
        <Routes>
          {/* Add PUBLIC routes here (no auth). */}
          <Route path="/*" element={<AuthenticatedRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>
);
```

**Why the four-state loader guard?** `useAuthentication` and the privilege-enrichment call are independent. Rendering children while either is still pending causes flashes of 403 and wasted API calls.

---

## 5. Backend Implementation (Express proxy)

The backend's job is to **forward** the browser's auth headers to APIm. It does not validate tokens itself (APIm does that).

### 5.1 `backend/errors.js`

```js
export class UnauthorizedError extends Error {
  constructor(status) { super(`HTTP ${status} - Unauthorized`); this.name = 'UnauthorizedError'; this.status = status; }
}
export class NotFoundError extends Error {
  constructor(status = 404) { super(`HTTP ${status} - Not Found`); this.name = 'NotFoundError'; this.status = status; }
}
```

### 5.2 `backend/server.js`

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? ['https://local.paycor.com:3000']
    : true,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist'), { index: 'index.html' }));

// Headers that must follow the user's request downstream.
const FORWARDED_HEADERS = [
  'authorization',
  'cookie',
  'time-zone',
  'ocp-apim-subscription-key',
];

export function extractAuthHeaders(req) {
  return Object.fromEntries(
    FORWARDED_HEADERS.flatMap((k) => req.headers[k] ? [[k, req.headers[k]]] : [])
  );
}

// Example: proxy handler that calls an upstream API with the user's auth.
app.use('/api/proxy', async (req, res, next) => {
  const headers = extractAuthHeaders(req);
  try {
    const upstream = await fetch(`${process.env.UPSTREAM_URL}${req.path}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });
    const body = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(body);
  } catch (err) { next(err); }
});

// SPA fallback: serve index.html for client-side routing.
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));

app.use((err, _req, res, _next) => {
  console.error('[EXPRESS ERROR]', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on ${port}`));
```

### 5.3 `backend/accessToken.js` — service-to-service token

Only use this for **machine-level** calls (e.g., deploy-time file uploads). Never use it to impersonate a user.

```js
import axios from 'axios';

const clientId = process.env.NODE_ENV === 'development'
  ? '<DEV_BACKEND_CLIENT_ID>' : '#{OAuth-ClientID}';
const secret = process.env.NODE_ENV === 'development'
  ? '<DEV_BACKEND_CLIENT_SECRET>' : '#{OAuth-ClientSecret}';

export const apimSubscriptionKey = process.env.NODE_ENV === 'development'
  ? '<DEV_APIM_SUBSCRIPTION_KEY>' : '#{Project-APIm-Key}';

export default async function getAccessToken(apiHost) {
  const body = new URLSearchParams();
  body.append('client_id', clientId);
  body.append('client_secret', secret);
  body.append('grant_type', 'client_credentials');

  const url = new URL('/sts/v2/common/token', apiHost);
  try {
    const resp = await axios.post(url.toString(), body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': apimSubscriptionKey,
      },
    });
    return resp.data.access_token;
  } catch (err) {
    console.error('Error fetching service access token:', err);
    return null;
  }
}
```

**Never commit real secrets.** In production, `#{…}` placeholders are replaced by your deploy system (Octopus, Azure DevOps, etc.).

---

## 6. Vite Dev Server Configuration

`frontend/vite.config.ts` must:
1. Serve over HTTPS on port 3000 using the self-signed cert.
2. Bind to hostname `local.paycor.com`.
3. Proxy `/sts` and any APIm paths to the dev Paycor endpoints so the implicit-grant redirects work without CORS headaches.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: {
    host: 'local.paycor.com',
    port: 3000,
    https: {
      cert: fs.readFileSync('../cert/_cert.pem'),
      key:  fs.readFileSync('../cert/_cert.pem'),  // or a separate key file
    },
    proxy: {
      '/sts':      { target: 'https://api-quarterly.paycor.com', changeOrigin: true, secure: true },
      '/Accounts': { target: 'https://hcm-quarterly.paycor.com', changeOrigin: true, secure: true },
    },
  },
});
```

---

## 7. Verification Checklist

After wiring everything up, verify each item. If any step fails, stop and debug before moving on.

1. **Redirect to STS** — Load `https://local.paycor.com:3000/<urlPath>/`. You should be redirected to `/sts/v1/common` and see Paycor's login page.
2. **Callback returns to the app** — After signing in, the URL fragment contains `#access_token=…` and the app renders (no infinite spinner).
3. **User in context** — `getCurrentUser()` returns a user with a non-empty `access_token` and `profile.sub`.
4. **Privilege enrichment** — Either the app renders normally (if the user has `ACCESS_PRIVILEGE_ID`) or you see `ForbiddenPage`. Toggle a test account's privilege to confirm both paths.
5. **Authenticated API call** — An axios call through `getAxiosInstance()` sends `Authorization: Bearer …` and `Ocp-Apim-Subscription-Key: …` (inspect in DevTools Network). 401/403 responses surface as `errorMessage_401` / `errorMessage_403`.
6. **Silent renew** — Leave the tab idle past the token lifetime. Inspect the DOM; a hidden iframe briefly loads `silent_renew.html` and the `user.access_token` value updates without a page reload.
7. **SessionTimeout** — The Paycor session-expired modal appears when HCM session ends.
8. **Backend forwarding** — A request from the SPA through an Express-proxied route arrives upstream with `Authorization`, `Cookie`, `Time-Zone`, and `Ocp-Apim-Subscription-Key` intact.
9. **Service token (optional)** — `getAccessToken(apiHost)` returns a non-null string when called from the backend.

---

## 8. Common Pitfalls

- **Using `localhost` in dev.** OIDC rejects the redirect. Always use `local.paycor.com`.
- **Switching to PKCE.** `@paycor/yatti-react` and the STS client registration assume implicit flow (`response_type: 'token'`). Changing it silently breaks token issuance.
- **Dropping the APIm key.** Every call — including the OIDC token request — needs `Ocp-Apim-Subscription-Key` (as a header) or `subscription-key` (as a query param in `extraQueryParams`). APIm returns 401 otherwise, which looks like an auth-token problem but isn't.
- **Reading the token from React state in non-React code.** Use `getCurrentUser()` from the module-level escape hatch. A React hook won't resolve in an axios interceptor.
- **Forgetting `withCredentials: true`.** Paycor HCM session cookies are cross-origin; without this flag they won't be sent and downstream session validation fails intermittently.
- **Rendering protected routes before enrichment completes.** The four-state guard (`authStatus` × `enrichState`) exists specifically to prevent flashes of 403 UI.
- **Clearing the query cache on every `user` reference change.** Only clear when `profile.sub` actually changes — otherwise a silent renew will wipe your cache.
- **Hardcoding secrets.** Dev values may be checked in for convenience, but production must use `#{…}` substitution handled by the deploy pipeline.

---

## 9. What You Do NOT Need to Build Here

- A login form — STS owns the login UI.
- Token validation on the Node backend — APIm validates JWTs at the edge.
- Refresh-token handling — implicit flow + `automaticSilentRenew` replaces it.
- Logout endpoints — `SessionTimeout` and HCM handle sign-out.

---

## 10. Deliverables to Commit

When finished, the repo should contain:

1. The 10 files listed in section 2 (project layout), fully populated.
2. An `.env.example` listing every variable the app reads (and **no real secrets**).
3. A README entry explaining:
   - How to install the self-signed cert and add the hostname to `/etc/hosts`.
   - Which npm registry/token is required for `paycor-oidc-client`.
   - The list of `#{…}` placeholders the deploy system must replace.
4. Proof that all 9 verification checks in section 7 pass.

Stop and ask the platform team before proceeding if:
- You cannot resolve `paycor-oidc-client` from the npm registry.
- STS rejects your redirect URIs (they may not yet be registered).
- Your APIm key returns 401 on every request (likely a missing subscription).
