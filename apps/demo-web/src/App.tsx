import { useEffect, useMemo, useRef, useState } from "react";
import { connectAiWallet, disconnectAiWallet, getAiWalletModels, getAiWalletPermissions, requestResponseStream } from "@aipocket/connect-modal";
import type { AiWalletPermission } from "@aipocket/protocol";
import { buildConnectRequest } from "./connect-request";
import { getConnectionStatus } from "./demo-state";
import { createTopic, deleteTopic, sortTopics, updateTopicDraft, updateTopicMessages, type ChatMessage, type DemoTopic } from "./topics";

const TOPICS_STORAGE_KEY = "aipocketDemoTopics";

function loadTopics(): DemoTopic[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOPICS_STORAGE_KEY) ?? "[]") as DemoTopic[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [createTopic()];
  } catch {
    return [createTopic()];
  }
}

export function App() {
  const requestIdRef = useRef(0);
  const [permission, setPermission] = useState<AiWalletPermission | null>(null);
  const [error, setError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasProvider, setHasProvider] = useState(true);
  const [approvedModels, setApprovedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [providerId, setProviderId] = useState("");
  const [topics, setTopics] = useState<DemoTopic[]>(() => loadTopics());
  const [activeTopicId, setActiveTopicId] = useState(() => sortTopics(loadTopics())[0].id);

  const activeTopic = useMemo(() => topics.find((topic) => topic.id === activeTopicId) ?? topics[0] ?? createTopic(), [activeTopicId, topics]);
  const status = getConnectionStatus({ hasProvider, isConnected: permission !== null, isStreaming });
  const sortedTopics = sortTopics(topics);

  useEffect(() => {
    localStorage.setItem(TOPICS_STORAGE_KEY, JSON.stringify(topics));
  }, [topics]);

  useEffect(() => {
    let cancelled = false;

    async function restorePermission() {
      try {
        const permissions = await getAiWalletPermissions();
        if (!cancelled) {
          setHasProvider(true);
          const restoredPermission = permissions[0] ?? null;
          setPermission(restoredPermission);
          setApprovedModels(restoredPermission?.models ?? []);
          setSelectedModel(restoredPermission?.models[0] ?? "");
          setProviderId(restoredPermission?.providerId ?? "");
        }
      } catch (restoreError) {
        if (!cancelled) {
          setHasProvider(false);
          if (restoreError instanceof Error && restoreError.name !== "AiWalletNotFoundError") {
            setError(restoreError.message);
          }
        }
      }
    }

    void restorePermission();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateActiveTopic(updater: (topic: DemoTopic) => DemoTopic) {
    setTopics((currentTopics) => currentTopics.map((topic) => (topic.id === activeTopic.id ? updater(topic) : topic)));
  }

  async function connect() {
    setError("");
    try {
      const modelInfo = await getAiWalletModels();
      setHasProvider(true);
      const nextPermission = await connectAiWallet(buildConnectRequest({ providerId, models: modelInfo.models }));
      setPermission(nextPermission);
      setApprovedModels(nextPermission.models);
      setSelectedModel(nextPermission.models[0] ?? "");
    } catch (connectError) {
      if (connectError instanceof Error && connectError.name === "AiWalletNotFoundError") {
        setHasProvider(false);
      }
      setError(connectError instanceof Error ? connectError.message : "Failed to connect AIPocket");
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
      setIsStreaming(false);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Failed to disconnect AIPocket");
    }
  }

  async function sendPrompt() {
    if (!permission) {
      setError("Connect AIPocket first");
      return;
    }

    const prompt = activeTopic.draft.trim();
    if (!prompt) {
      return;
    }

    const model = selectedModel || approvedModels[0];
    if (!model) {
      setError("No approved model available");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const userMessage: ChatMessage = { id: `user-${requestId}`, role: "user", content: prompt };
    const assistantMessage: ChatMessage = { id: `assistant-${requestId}`, role: "assistant", content: "" };
    const nextMessages = [...activeTopic.messages, userMessage, assistantMessage];

    setError("");
    updateActiveTopic((topic) => ({ ...updateTopicMessages(topic, nextMessages), draft: "" }));
    setIsStreaming(true);

    try {
      await requestResponseStream({
        sessionId: permission.sessionId,
        providerId: permission.providerId,
        model,
        input: prompt,
        onDelta: (delta) => {
          if (requestIdRef.current === requestId) {
            setTopics((currentTopics) =>
              currentTopics.map((topic) => {
                if (topic.id !== activeTopic.id) {
                  return topic;
                }

                const streamedMessages = topic.messages.map((message) =>
                  message.id === assistantMessage.id ? { ...message, content: message.content + delta } : message
                );
                return updateTopicMessages(topic, streamedMessages);
              })
            );
          }
        }
      });
    } catch (streamError) {
      if (requestIdRef.current === requestId) {
        setError(streamError instanceof Error ? streamError.message : "AIPocket stream failed");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsStreaming(false);
      }
    }
  }

  function createNewTopic() {
    requestIdRef.current += 1;
    const topic = createTopic();
    setTopics((currentTopics) => [topic, ...currentTopics]);
    setActiveTopicId(topic.id);
    setError("");
    setIsStreaming(false);
  }

  function clearCurrentTopic() {
    requestIdRef.current += 1;
    updateActiveTopic((topic) => updateTopicMessages({ ...topic, draft: "1+2=?" }, []));
    setError("");
    setIsStreaming(false);
  }

  function removeCurrentTopic() {
    const result = deleteTopic(topics, activeTopic.id);
    setTopics(result.topics);
    setActiveTopicId(result.activeTopicId);
  }

  return (
    <main className="app-shell">
      <div className="demo-layout">
        <aside className="topic-sidebar">
          <div className="sidebar-brand">
            <h1>AIPocket</h1>
            <span className={`status-badge ${status.tone}`}>{status.label}</span>
          </div>
          <button className="primary-button full-width" onClick={createNewTopic} disabled={isStreaming}>New Topic</button>

          <nav className="topic-list" aria-label="Topics">
            {sortedTopics.map((topic) => (
              <button
                className={`topic-item ${topic.id === activeTopic.id ? "active" : ""}`}
                key={topic.id}
                onClick={() => setActiveTopicId(topic.id)}
                disabled={isStreaming}
              >
                <span>{topic.title}</span>
                <small>{topic.messages.length === 0 ? "Empty" : `${topic.messages.length} messages`}</small>
              </button>
            ))}
          </nav>

          <div className="connection-card">
            <div>
              <strong>{permission ? "Connected" : "Disconnected"}</strong>
              <p>{permission?.providerId ?? "No active session"}</p>
            </div>
            {permission ? (
              <button className="secondary-button" onClick={disconnect} disabled={isStreaming}>Disconnect</button>
            ) : (
              <button className="secondary-button" onClick={connect}>Connect</button>
            )}
          </div>
        </aside>

        <section className="chat-panel">
          <header className="chat-topbar">
            <div>
              <h2>{activeTopic.title}</h2>
              <p>{permission ? selectedModel || approvedModels[0] || "No model selected" : "Connect AIPocket first"}</p>
            </div>
            <div className="topbar-actions">
              <button className="ghost-button" onClick={clearCurrentTopic} disabled={isStreaming}>Clear Topic</button>
              <button className="ghost-button" onClick={removeCurrentTopic} disabled={isStreaming}>Delete</button>
            </div>
          </header>

          <div className="settings-row">
            <label>
              Provider ID
              <input value={providerId} onChange={(event) => setProviderId(event.target.value)} placeholder="Optional" />
            </label>
            {approvedModels.length > 1 ? (
              <label>
                Model
                <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                  {approvedModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="chat-window" aria-live="polite">
            {activeTopic.messages.length === 0 ? (
              <div className="empty-state">
                <strong>Start a conversation</strong>
                {!permission ? <p>Connect AIPocket first.</p> : null}
              </div>
            ) : activeTopic.messages.map((message) => (
              <div className={`message ${message.role}`} key={message.id}>
                {message.content || (message.role === "assistant" && isStreaming ? "Thinking..." : "")}
              </div>
            ))}
          </div>

          <div className="composer">
            {error ? <p className="alert" role="alert">{error}</p> : null}
            {!hasProvider ? <p className="alert" role="alert">Install or reload AIPocket, then refresh this tab.</p> : null}
            <textarea
              value={activeTopic.draft}
              onChange={(event) => updateActiveTopic((topic) => updateTopicDraft(topic, event.target.value))}
              placeholder="Ask anything..."
              rows={3}
            />
            <div className="composer-actions">
              <button className="primary-button" onClick={sendPrompt} disabled={isStreaming || !permission || activeTopic.draft.trim().length === 0}>
                {isStreaming ? "Streaming..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
