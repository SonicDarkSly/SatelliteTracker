/** INFRASTRUCTURE — utilitaires HTTP. */

export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'SatelliteTracker/1.0 (projet personnel ; suivi orbital temps réel)',
  Accept: 'text/plain,*/*;q=0.8',
  'Accept-Language': 'fr,en;q=0.8',
};

/** fetch avec timeout. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Message d'erreur réseau enrichi de sa cause (DNS, TLS, reset…). */
export function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cause = (err as any).cause;
  const causeMsg = cause?.code ?? cause?.message;
  return causeMsg ? `${err.message} (${causeMsg})` : err.message;
}

/**
 * fetch avec timeout et nouvelle tentative en cas d'erreur réseau
 * (pas de retry sur une réponse HTTP, même en erreur).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
  retries = 1,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (err) {
      if (attempt >= retries) throw new Error(describeNetworkError(err));
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

/** Pause de courtoisie entre deux requêtes vers un même site. */
export function politePause(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
