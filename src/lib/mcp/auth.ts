const STS_URL =
  'https://api-quarterly.paycor.com/sts/v2/common/token'
const ACCESS_TOKEN_CACHE_MS = 4 * 60 * 1000

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

let storedRefreshToken: string | null = null

let cachedAccessToken: string | null = null
let accessTokenExpiresAt = 0

let pendingRequest: Promise<string> | null = null

export async function getMCPAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt) {
    return cachedAccessToken
  }

  if (pendingRequest) {
    return pendingRequest
  }

  pendingRequest = acquireAccessToken().finally(() => {
    pendingRequest = null
  })

  return pendingRequest
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not configured.`)
  }
  return value
}

async function stsRequest(
  body: URLSearchParams,
  extraHeaders?: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(STS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Ocp-Apim-Subscription-Key': requireEnv('MCP_SUBSCRIPTION_KEY'),
      ...extraHeaders,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `STS token request failed (${response.status}): ${text || response.statusText}`,
    )
  }

  return (await response.json()) as TokenResponse
}

async function obtainRefreshToken(): Promise<string> {
  const data = await stsRequest(
    new URLSearchParams({
      grant_type: 'delegation',
      client_id: requireEnv('MCP_CLIENT_ID'),
      client_secret: requireEnv('MCP_CLIENT_SECRET'),
      scope: 'offline_access',
    }),
    { Authorization: `Bearer ${requireEnv('MCP_API_TOKEN')}` },
  )

  if (!data.refresh_token) {
    throw new Error('STS delegation response did not include a refresh_token')
  }

  storedRefreshToken = data.refresh_token
  return storedRefreshToken
}

async function exchangeRefreshToken(refreshToken: string): Promise<string> {
  const data = await stsRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: requireEnv('MCP_CLIENT_ID'),
      client_secret: requireEnv('MCP_CLIENT_SECRET'),
      refresh_token: refreshToken,
    }),
  )

  if (data.refresh_token) {
    storedRefreshToken = data.refresh_token
  }

  cachedAccessToken = data.access_token
  accessTokenExpiresAt = Date.now() + ACCESS_TOKEN_CACHE_MS

  return cachedAccessToken
}

async function acquireAccessToken(): Promise<string> {
  if (!storedRefreshToken) {
    await obtainRefreshToken()
  }

  return exchangeRefreshToken(storedRefreshToken!)
}
