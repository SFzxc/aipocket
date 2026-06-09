import { useEffect, useRef, useState } from "react";
import { connectAiWallet, disconnectAiWallet, getAiWalletModels, getAiWalletPermissions, requestResponseStream } from "@ai-wallet/connect-modal";
import type { AiWalletPermission } from "@ai-wallet/protocol";

export function App() {
  const requestIdRef = useRef(0);
  const [permission, setPermission] = useState<AiWalletPermission | null>(null);
  const [prompt, setPrompt] = useState("1+2=?");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelSource, setModelSource] = useState("");
  const [approvedModels, setApprovedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [providerId, setProviderId] = useState("provider_openai");

  useEffect(() => {
    let cancelled = false;

    async function restorePermission() {
      try {
        const modelInfo = await getAiWalletModels();
        const permissions = await getAiWalletPermissions();
        if (!cancelled) {
          setAvailableModels(modelInfo.models);
          setModelSource(modelInfo.source);
          const restoredPermission = permissions[0] ?? null;
          setPermission(restoredPermission);
          setApprovedModels(restoredPermission?.models ?? []);
          setSelectedModel(restoredPermission?.models[0] ?? "");
          setProviderId(restoredPermission?.providerId ?? "provider_openai");
        }
      } catch {
        // Extension may be absent on first demo load; explicit Connect still reports errors.
      }
    }

    void restorePermission();

    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setError("");
    try {
      const modelInfo = await getAiWalletModels();
      setAvailableModels(modelInfo.models);
      setModelSource(modelInfo.source);
      const nextPermission = await connectAiWallet({
        providerId,
        models: modelInfo.models,
        reason: "Demo conversation needs AI response access"
      });
      setPermission(nextPermission);
      setApprovedModels(nextPermission.models);
      setSelectedModel(nextPermission.models[0] ?? "");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to connect AI Wallet");
    }
  }

  async function disconnect() {
    if (!permission) {
      return;
    }

    setError("");
    try {
      await disconnectAiWallet(permission.sessionId);
      requestIdRef.current += 1;
      setPermission(null);
      setApprovedModels([]);
      setSelectedModel("");
      setOutput("");
      setIsStreaming(false);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect AI Wallet");
    }
  }

  async function sendPrompt() {
    if (!permission) {
      setError("Connect AI Wallet first");
      return;
    }

    const model = selectedModel || approvedModels[0];
    if (!model) {
      setError("No approved model available");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setError("");
    setOutput("");
    setIsStreaming(true);

    try {
      await requestResponseStream({
        sessionId: permission.sessionId,
        providerId: permission.providerId,
        model,
        input: prompt,
        onDelta: (delta) => {
          if (requestIdRef.current === requestId) {
            setOutput((currentOutput) => currentOutput + delta);
          }
        }
      });
    } catch (streamError) {
      if (requestIdRef.current === requestId) {
        setError(streamError instanceof Error ? streamError.message : "AI Wallet stream failed");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsStreaming(false);
      }
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>AI Wallet Demo</h1>
      <p>Connect extension, send <code>1+2=?</code>, then render streamed result.</p>
      {permission ? <button onClick={disconnect}>Disconnect AI Wallet</button> : <button onClick={connect}>Connect AI Wallet</button>}
      <label style={{ display: "block", marginTop: 12 }}>
        Provider ID
        <input value={providerId} onChange={(event) => setProviderId(event.target.value)} style={{ display: "block", marginTop: 4 }} />
      </label>
      {availableModels.length > 0 ? <p>Available models ({modelSource}): {availableModels.join(", ")}</p> : null}
      {permission ? (
        <p>
          Connected<br />
          Provider: {permission.providerId}<br />
          Connected models: {permission.models.join(", ")}<br />
          Expires at: {permission.expiresAt}
        </p>
      ) : (
        <p>Disconnected</p>
      )}
      <section style={{ marginTop: 24 }}>
        {approvedModels.length > 1 ? (
          <label style={{ display: "block", marginBottom: 12 }}>
            Model
            <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} style={{ display: "block", marginTop: 4 }}>
              {approvedModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>
        ) : approvedModels.length === 1 ? (
          <p>Model: <strong>{approvedModels[0]}</strong></p>
        ) : null}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          style={{ width: "100%" }}
        />
        <button onClick={sendPrompt} disabled={isStreaming}>{isStreaming ? "Streaming..." : "Send"}</button>
      </section>
      {error ? <p role="alert">{error}</p> : null}
      <pre>{output}</pre>
    </main>
  );
}
