const DEFAULT_ADMIN_KEY = "change-this-before-public-deployment";

export function assertSafePublicBinding(host: string, adminApiKey: string): void {
  if (isLoopbackHost(host)) return;
  const key = adminApiKey.trim();
  if (key.length >= 24 && key !== DEFAULT_ADMIN_KEY) return;
  throw new Error(
    "Refusing to bind BossAI Radar Lite to a non-loopback host with a missing, weak, or default RADAR_ADMIN_API_KEY.",
  );
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}
