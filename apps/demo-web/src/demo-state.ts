export type ConnectionTone = "warning" | "neutral" | "success" | "active";

export function getConnectionStatus({
  hasProvider,
  isConnected,
  isStreaming
}: {
  hasProvider: boolean;
  isConnected: boolean;
  isStreaming: boolean;
}): { label: string; tone: ConnectionTone } {
  if (!hasProvider) {
    return { label: "Extension missing", tone: "warning" };
  }

  if (isStreaming) {
    return { label: "Streaming", tone: "active" };
  }

  if (isConnected) {
    return { label: "Connected", tone: "success" };
  }

  return { label: "Disconnected", tone: "neutral" };
}
