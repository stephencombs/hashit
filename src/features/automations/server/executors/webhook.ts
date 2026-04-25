import type { ExecutorResult } from "./index";

export async function executeWebhook(
  config: Record<string, unknown>,
): Promise<ExecutorResult> {
  const url = config.url as string | undefined;
  const method = (config.method as string | undefined)?.toUpperCase() ?? "POST";
  const headers = (config.headers as Record<string, string> | undefined) ?? {};
  const body = config.body as unknown;

  if (!url) {
    return { success: false, error: "Missing url in automation config" };
  }

  const fetchOptions: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };

  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    return {
      success: false,
      error: `Webhook returned ${res.status}: ${text}`,
    };
  }

  return { success: true, data: { status: res.status } };
}
