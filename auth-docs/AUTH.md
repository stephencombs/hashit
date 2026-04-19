# Authentication Implementation

This document describes the end-to-end authentication implementation for the Teammate Agent UI project. The project is split into a **React/Vite frontend** (user-facing SPA) and an **Express/Node backend** (CopilotKit runtime proxy). Authentication is built around Paycor's OIDC/OAuth2 infrastructure, with API Management (APIm) as the edge gateway.

---

## 1. High-Level Architecture

```
Browser (React SPA)
   │  OIDC implicit/silent flow (paycor-oidc-client + @paycor/yatti-react)
   │  ─► obtains access_token from /sts/v1/common
   │
   │  Bearer <access_token> + Ocp-Apim-Subscription-Key
   ▼
Express Backend (backend/server.js)
   │  forwards auth headers to CopilotKit runtime / .NET API
   ▼
Paycor APIm gateway ─► Teammate.Service (.NET) / Agent endpoint
```

Two distinct token-acquisition paths exist:

1. **User-context path (frontend)** — Browser-based OIDC implicit flow that produces a user access token. This is the dominant path for all authenticated screens.
2. **Service-to-service path (backend)** — `client_credentials` OAuth2 grant used by the backend only for machine-level calls (e.g. uploading prompt files). This path is **not** used for user requests.

---

## 2. Frontend Authentication

### 2.1 Libraries

- `@paycor/yatti-react` — provides `useAuthentication` hook and `SessionTimeout` component (Paycor's shared auth wrapper).
- `paycor-oidc-client` — fork of `oidc-client-js`; provides `UserManager`, `User` type, and `getUserByAccessToken` (which enriches the user with privileges).

Registered in `frontend/package.json` as `"@paycor/yatti-react": "^3.0.9"`.

### 2.2 OIDC Configuration

File: `frontend/src/shared/config/authenticationConfig.ts`

```ts
const userManagerSettings = {
  client_id: appConfig.oauthClientId,            // 'TeammateAgentUI' (dev) / '#{FrontEnd-Oauth-ClientID}' (prod)
  redirect_uri: `${hcmBaseUrl}/${urlPath}/oauth/silent_renew.html`,
  response_type: 'token',                        // implicit flow (access token only)
  scope: appConfig.oauthClientId,
  authority: '/sts/v1/common' | '#{BaseURL-API}/sts/v1/common',
  silent_redirect_uri: …/oauth/silent_renew.html,
  automaticSilentRenew: true,                    // background token refresh
  filterProtocolClaims: true,
  loadUserInfo: true,
  includeIdTokenInSilentRenew: false,
  extraQueryParams: {
    'subscription-key': '<APIm subscription key>'
  },
};
```

Notable points:

- Response type `token` — the app uses the **OAuth2 implicit grant**, not PKCE or auth-code. Only an access token is retrieved (no ID token in silent renew).
- **Automatic silent renew** refreshes the token in the background using a hidden iframe pointing at `silent_renew.html`.
- The APIm subscription key is attached as a query parameter on token requests via `extraQueryParams`.

### 2.3 Silent-Renew Callback Pages

`frontend/public/oauth/silent_renew.html` — loaded inside the silent-renew iframe:

```html
<script src="oidc-client.rsa256.slim.min.js"></script>
<script>
  const userManagerConfig = {
    loadUserInfo: false,
    extraQueryParams: { "subscription-key": "#{Project-APIm-Key}" },
  };
  var mgr = new UserManager(userManagerConfig);
  mgr.signinSilentCallback();
</script>
```

`frontend/public/oauth/silent.html` — signin-redirect callback used for the top-level login flow. It clears stale state, completes `signinRedirectCallback()`, and redirects back to the app root.

### 2.4 Route Protection

File: `frontend/src/app/main.tsx`

The app tree is split into **public** and **authenticated** routes:

Public (no auth):
- `/feedback/submit`, `/feedback/thanks`, `/feedback/duplicate`, `/feedback/error`
- `/cancel`

Authenticated (everything else) is wrapped in `<AuthenticatedRoutes />`:

```tsx
const { status: authStatus, user } = useAuthentication(userManagerSettings);
```

Auth flow inside `AuthenticatedRoutes`:

1. `useAuthentication` triggers login/redirect or returns `status: 'success'` with the `user` and their `access_token`.
2. When authentication succeeds, the component calls `new UserManager(userManagerSettings).getUserByAccessToken(user.access_token)` to enrich the base OIDC user with Paycor privileges.
3. On error or failure, it falls back to the basic user object (without privileges).
4. While loading, `<FullPageLoader />` is rendered.
5. A `prevUserIdRef` watches `user.profile.sub` — if the authenticated user changes, the React Query cache is cleared to prevent stale cross-user data.

### 2.5 Privilege Gating (Authorization)

Two privilege-gated route wrappers:

```tsx
const AccessTeammate_PrivilegeID = 2253;

const ProtectedApp = ({ user }) => {
  if (!user?.hasPrivilege(AccessTeammate_PrivilegeID)) {
    return <PageForbidden />;
  }
  return <Suspense …><App /></Suspense>;
};
```

The same check is applied to `<ProtectedApprovalPage />` for the `/approval/:messageId/:action` route. Users without privilege **2253** see the `ForbiddenPage` (403 UI) defined in `frontend/src/features/approval/components/ForbiddenPage.tsx`.

### 2.6 User Context Propagation

File: `frontend/src/shared/context/UserContextProvider.tsx`

Once the enriched user is ready, it is exposed via React context **and** stored in a module-level variable so non-React code (axios interceptors, utilities) can reach it:

```ts
let currentUser: User | null = null;

export const UserProvider = ({ user, children }) => {
  currentUser = user;    // non-React access
  return <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>;
};

export const useUser = () => …;
export const getCurrentUser = () => currentUser;
```

`frontend/src/shared/utils/userUtils.ts` exposes `getUserId()` which returns `user.profile.sub` for use in React Query keys.

### 2.7 Session Timeout

At the root (`<Root />` in `main.tsx`), `<SessionTimeout />` from `@paycor/yatti-react` is rendered with:

```tsx
<SessionTimeout
  APIm={appConfig.apimSubscriptionKey}
  applicationUrl={appConfig.hcmBaseUrl}
  refreshUrl={`${appConfig.hcmBaseUrl}/accounts/`}
/>
```

This handles idle-timeout UX, session warning, and sign-out redirection using the shared Paycor HCM session infrastructure.

---

## 3. Outbound API Authentication (Frontend → Backend/APIm)

### 3.1 Shared Axios Factory

File: `frontend/src/shared/api/index.ts`

```ts
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
```

Every HTTP helper (`GET`, `POST`, `PUT`, `DELETE`, `JSON_PATCH`) uses this factory, so every authenticated outbound request carries:

- `Authorization: Bearer <user access_token>`
- `Ocp-Apim-Subscription-Key: <APIm subscription key>`
- `withCredentials: true` (cookies forwarded for cross-origin calls to `paycor.com`)

### 3.2 Centralized 401 / 403 Handling

All methods normalize server errors:

- `401` → rejects with `new Error(errorMessage_401)` (`'unauthorized'`)
- `403` → rejects with `new Error(errorMessage_403)` (`'forbidden'`)
- Other non-2xx → rejects with `new HttpError(status)`

Callers use these sentinels to trigger redirect to sign-in or the Forbidden UI.

### 3.3 CopilotKit Runtime Authentication

File: `frontend/src/features/chat/components/CopilotKitV2Provider.tsx`

The agent runtime is configured with the same bearer + subscription-key headers, plus the browser's IANA `Time-Zone`:

```ts
const headers = useMemo(() => ({
  'Time-Zone': timeZone,
  Authorization: `Bearer ${accessToken}`,
  'Ocp-Apim-Subscription-Key': appConfig.apimSubscriptionKey,
}), [timeZone, accessToken]);
```

These headers are handed to `<CopilotKitProvider headers={headers} …>` and forwarded on every agent call.

### 3.4 Approval / Email Actions

File: `frontend/src/features/approval/useAction.ts`

`useAction` (TanStack Query mutation) constructs its own axios call because it targets the email approval endpoint directly. It uses the same three-header pattern (`Authorization`, `Ocp-Apim-Subscription-Key`, `Time-Zone`) and handles the special `409 Already Processed` case.

### 3.5 DevTools Auth Header

File: `frontend/src/devtools/DevToolsProvider.tsx`

The internal DevTools panel (dev-only config endpoint) reuses `getCurrentUser().access_token` to authenticate its own `/devtools/config` fetch via the APIm base URL.

---

## 4. Public / Unauthenticated Flows

Certain flows are intentionally **not** behind OIDC because they are invoked from email links where the recipient isn't signed in. Each relies on a signed, short-lived JWT embedded in the URL.

### 4.1 Feedback Submission

File: `frontend/src/pages/feedback/FeedbackHandler.tsx`

- Reads `?token=<jwt>` from the URL.
- Client-side validation via `isValidJWTFormat()`:
  - Must split into exactly 3 parts.
  - Each part must match `/^[A-Za-z0-9_-]+$/` (base64url).
- Calls `GET {baseEmailFeedbackUrl}?token=<jwt>` with only the `Ocp-Apim-Subscription-Key` header (no `Authorization`).
- Server-side validation and identity is performed by APIm → ChannelProcessor → Teammate.Service; the frontend does not see the user.
- Error messages are sanitized (`<[^>]*>` stripped, 200-char cap) before being rendered into the URL query to prevent XSS.

### 4.2 Cancel Request

File: `frontend/src/pages/cancel/CancelPage.tsx`

Same pattern as feedback:
- JWT extracted from the URL, format-validated client-side.
- `GET …/cancel/details?token=…` to load preview.
- `POST …/cancel/confirm?token=…` to perform cancellation.
- Only APIm subscription key + `Time-Zone` are sent; the JWT itself is the authentication material.

---

## 5. Backend Authentication

File: `backend/server.js` (Express) and `backend/thread-agent-runner.js` (ThreadAgentRunner).

The backend is a thin proxy in front of the CopilotKit runtime and the .NET service. It **does not mint its own user tokens** for user requests; it forwards whatever auth the browser sent.

### 5.1 Header Forwarding

```js
const FORWARDED_HEADERS = [
  'authorization',
  'cookie',
  'time-zone',
  'ocp-apim-subscription-key',
];

function createHttpAgentWithAuth(req) {
  const headers = Object.fromEntries(
    FORWARDED_HEADERS.flatMap(k => req.headers[k] ? [[k, req.headers[k]]] : [])
  );
  return new HttpAgent({ url: AGENT_URL, headers });
}
```

Each incoming `/api/copilotkit/...` request gets a per-request `HttpAgent` configured with the user's `Authorization`, `Cookie`, `Time-Zone`, and `Ocp-Apim-Subscription-Key`. Those headers flow through to the AG-UI agent endpoint.

### 5.2 Per-Thread Credential Registration (Workaround)

CopilotKit's built-in `extractForwardableHeaders()` forwards only `Authorization` and `x-*` headers, which drops `Cookie` and `Ocp-Apim-Subscription-Key`. To keep those available when the runner later calls the .NET API during `connect()`, the Express middleware pre-registers them keyed by `threadId`:

```js
if (req.method === 'POST' && req.path.includes('/connect') && req.body?.threadId) {
  threadRunner.setThreadCredentials(
    req.body.threadId,
    extractAuthHeaders(req),
    req.body.forwardedProps?.companyId,
    req.body.forwardedProps?.isNewThread
  );
}
```

Inside `ThreadAgentRunner.#fetchThreadMessages()`:

```js
const storedCredentials = this.#threadCredentials.get(threadId) || {};
const fetchHeaders = { Accept: 'application/json', ...storedCredentials };
// …plus any Authorization/x-* CopilotKit forwarded explicitly
```

Stored credentials are deleted after the connect completes (`finally` block) to avoid leaking between threads.

### 5.3 Backend Error Mapping

File: `backend/errors.js`

```js
export class UnauthorizedError extends Error { constructor(status) { … } }
export class NotFoundError    extends Error { constructor(status=404) { … } }
```

In `ThreadAgentRunner.#fetchAndReplay()`, HTTP `401`/`403` from the .NET API become a `RUN_ERROR` event with the message *"Your session has expired or you are not authorized to view this conversation."*, so the frontend UI can surface the failure instead of silently losing the stream.

### 5.4 Service-to-Service Token (client_credentials)

File: `backend/accessToken.js`

The backend can also mint a **machine token** via OAuth2 client credentials. This is used for operations that don't require an end-user identity (e.g. prompt-file uploads in production):

```js
const clientId     = process.env.NODE_ENV === 'development' ? 'TeammateService' : '#{OAuth-ClientID}';
const secret       = process.env.NODE_ENV === 'development' ? 'jY5Tl…' : '#{OAuth-ClientSecret}';
const apimKey      = process.env.NODE_ENV === 'development' ? '255f5fdf…' : '#{Project-APIm-Key}';

const url = new URL('/sts/v2/common/token', apiHost);
// POST grant_type=client_credentials with Ocp-Apim-Subscription-Key header
// returns access_token
```

Note the **dev secret is hardcoded** for local development convenience. In production, values are injected at deploy time through Octopus variable substitution (`#{…}` tokens in `Octopus.Azure.*.AppSettings.json`).

---

## 6. Environment Configuration

File: `frontend/src/shared/config/appConfig.ts`

Key auth-adjacent values per environment:

| Key | Dev | Prod |
|---|---|---|
| `oauthClientId` | `TeammateAgentUI` | `#{FrontEnd-Oauth-ClientID}` |
| `apimSubscriptionKey` | `255f5fdf…` | `#{Project-APIm-Key}` |
| `hcmBaseUrl` | `//hcm-quarterly.paycor.com` | `#{BaseURL-HCM}` |
| `apimBaseUrl` | *(empty — uses Vite proxy)* | `#{BaseURL-API}` |
| STS authority | `/sts/v1/common` | `#{BaseURL-API}/sts/v1/common` |

In dev, the frontend runs on `https://local.paycor.com:3000` (see `cert/` and CORS allow-list in `backend/server.js`). The custom hostname is required because OIDC flows enforce origin matching against the registered client.

---

## 7. Summary of Credentials in Play

| Credential | Source | Used By | Purpose |
|---|---|---|---|
| `access_token` (JWT) | STS `/sts/v1/common`, implicit grant | All authenticated API calls; forwarded from browser through backend | User-level identity and authorization |
| APIm subscription key | Build-time config | Every request to `apimBaseUrl`; OIDC token request | Edge gateway access |
| Cookie (session) | Paycor HCM session | Forwarded through backend with `withCredentials` | Supplemental Paycor session state |
| Service client_credentials token | STS `/sts/v2/common/token` | `backend/accessToken.js` — prompt blob upload etc. | Machine-to-machine calls |
| Feedback/Cancel JWT | Issued by Teammate.Service via email | Public feedback/cancel pages | One-time unauthenticated action tokens |
| Privilege `2253` | Enriched via `UserManager.getUserByAccessToken` | `ProtectedApp` / `ProtectedApprovalPage` | Coarse authorization for Teammate access |

---

## 8. Key Files Reference

Frontend:
- `frontend/src/app/main.tsx` — route gating, `useAuthentication`, privilege enrichment.
- `frontend/src/shared/config/authenticationConfig.ts` — `UserManager` settings.
- `frontend/src/shared/config/appConfig.ts` — environment-specific URLs / keys.
- `frontend/src/shared/context/UserContextProvider.tsx` — React + non-React user access.
- `frontend/src/shared/api/index.ts` — authenticated axios factory + 401/403 normalization.
- `frontend/src/features/chat/components/CopilotKitV2Provider.tsx` — agent runtime auth headers.
- `frontend/src/features/approval/useAction.ts` — approval/deny with bearer token.
- `frontend/src/features/approval/components/ForbiddenPage.tsx` — 403 UI.
- `frontend/src/pages/feedback/FeedbackHandler.tsx`, `frontend/src/pages/cancel/CancelPage.tsx` — public JWT-token flows.
- `frontend/public/oauth/silent_renew.html`, `frontend/public/oauth/silent.html` — OIDC callback pages.

Backend:
- `backend/server.js` — Express + CopilotKit runtime, header forwarding.
- `backend/thread-agent-runner.js` — per-thread credential registry, .NET API auth.
- `backend/accessToken.js` — client-credentials token minting.
- `backend/errors.js` — `UnauthorizedError` / `NotFoundError`.
