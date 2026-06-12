export function buildConnectRequest({ providerId, models }: { providerId: string; models: string[] }) {
  const trimmedProviderId = providerId.trim();

  return {
    ...(trimmedProviderId ? { providerId: trimmedProviderId } : {}),
    models,
    reason: "Demo conversation needs AI response access"
  };
}
