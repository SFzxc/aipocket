import { beforeEach, describe, expect, test, vi } from "vitest";

import { createSessionStore } from "./session-store";

describe("session store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));
  });

  test("creates session with session_ UUID and 30 minute expiration", () => {
    const store = createSessionStore();
    const session = store.createSession({
      tabId: 7,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"]
    });

    expect(session.sessionId).toMatch(/^session_[0-9a-f-]{36}$/);
    expect(session).toMatchObject({
      tabId: 7,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"],
      requestCount: 0,
      expiresAt: "2026-06-07T12:30:00.000Z"
    });
  });

  test("creates provider-scoped session with request limit and count", () => {
    const store = createSessionStore();
    const session = store.createSession({
      tabId: 7,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"],
      requestLimit: 2
    });

    expect(session).toMatchObject({ providerId: "provider_openai", requestLimit: 2, requestCount: 0 });
  });

  test("increments request count and rejects over limit", () => {
    const store = createSessionStore();
    const session = store.createSession({
      tabId: 1,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"],
      requestLimit: 1
    });

    expect(store.incrementRequestCount(session.sessionId)).toEqual({ ...session, requestCount: 1 });
    expect(
      store.getValidPermission({
        sessionId: session.sessionId,
        origin: "https://demo.localhost",
        tabId: 1,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini"
      })
    ).toBeNull();
  });

  test("gets active permission and deletes expired session", () => {
    const store = createSessionStore();
    const session = store.createSession({
      tabId: 1,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"]
    });

    expect(store.getActivePermission(session.sessionId)).toEqual(session);

    vi.setSystemTime(new Date("2026-06-07T12:31:00.000Z"));

    expect(store.getActivePermission(session.sessionId)).toBeNull();
    expect(store.getActivePermission(session.sessionId)).toBeNull();
  });

  test("lists active permissions for matching origin, tab, and frame and prunes expired", () => {
    const store = createSessionStore();
    const matching = store.createSession({
      tabId: 1,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"]
    });
    store.createSession({ tabId: 2, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });
    store.createSession({ tabId: 1, frameId: 1, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });
    store.createSession({ tabId: 1, frameId: 0, origin: "https://other.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });

    expect(store.getPermissionsForOrigin("https://demo.localhost", 1, 0)).toEqual([matching]);

    vi.setSystemTime(new Date("2026-06-07T12:31:00.000Z"));

    expect(store.getPermissionsForOrigin("https://demo.localhost", 1, 0)).toEqual([]);
    expect(store.getActivePermission(matching.sessionId)).toBeNull();
  });

  test("revokes one session or all sessions for a tab", () => {
    const store = createSessionStore();
    const session = store.createSession({ tabId: 1, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });
    const other = store.createSession({ tabId: 2, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });

    store.revokeSession(session.sessionId);

    expect(store.getActivePermission(session.sessionId)).toBeNull();
    expect(store.getActivePermission(other.sessionId)).toEqual(other);

    store.revokeSessionsForTab(2);

    expect(store.getActivePermission(other.sessionId)).toBeNull();
  });

  test("gets valid permission for matching stream request", () => {
    const store = createSessionStore();
    const session = store.createSession({ tabId: 1, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });

    expect(
      store.getValidPermission({
        sessionId: session.sessionId,
        origin: "https://demo.localhost",
        tabId: 1,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T12:01:00.000Z")
      })
    ).toEqual(session);
  });

  test("rejects valid permission lookup for wrong origin, tab, frame, or model", () => {
    const store = createSessionStore();
    const session = store.createSession({ tabId: 1, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });
    const base = {
      sessionId: session.sessionId,
      origin: "https://demo.localhost",
      tabId: 1,
      frameId: 0,
      providerId: "provider_openai",
      model: "gpt-4.1-mini",
      now: new Date("2026-06-07T12:01:00.000Z")
    };

    expect(store.getValidPermission({ ...base, origin: "https://other.localhost" })).toBeNull();
    expect(store.getValidPermission({ ...base, tabId: 2 })).toBeNull();
    expect(store.getValidPermission({ ...base, frameId: 1 })).toBeNull();
    expect(store.getValidPermission({ ...base, model: "gpt-4.1" })).toBeNull();
  });

  test("rejects expired permission lookup", () => {
    const store = createSessionStore();
    const session = store.createSession({ tabId: 1, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });

    expect(
      store.getValidPermission({
        sessionId: session.sessionId,
        origin: "https://demo.localhost",
        tabId: 1,
        frameId: 0,
        providerId: "provider_openai",
        model: "gpt-4.1-mini",
        now: new Date("2026-06-07T12:31:00.000Z")
      })
    ).toBeNull();
  });

  test("persists sessions and reloads active sessions from storage", async () => {
    let storedSessions: unknown[] = [];
    const storage = {
      getSessions: vi.fn(async () => storedSessions),
      setSessions: vi.fn(async (sessions: unknown[]) => {
        storedSessions = sessions;
      })
    };
    const store = createSessionStore({ storage });

    const session = await store.createSession({ tabId: 1, frameId: 0, origin: "https://demo.localhost", providerId: "provider_openai", models: ["gpt-4.1-mini"] });

    expect(storage.setSessions).toHaveBeenCalledWith([session]);

    const reloadedStore = createSessionStore({ storage });
    await expect(reloadedStore.getAllSessions()).resolves.toEqual([session]);
  });

  test("lists all active sessions and persists prune/revoke mutations", async () => {
    const activeSession = {
      sessionId: "session_active",
      tabId: 1,
      frameId: 0,
      origin: "https://demo.localhost",
      providerId: "provider_openai",
      models: ["gpt-4.1-mini"],
      requestCount: 0,
      expiresAt: "2026-06-07T12:30:00.000Z"
    };
    const expiredSession = {
      ...activeSession,
      sessionId: "session_expired",
      expiresAt: "2026-06-07T11:59:00.000Z"
    };
    const storage = {
      getSessions: vi.fn(async () => [activeSession, expiredSession]),
      setSessions: vi.fn(async () => undefined)
    };
    const store = createSessionStore({ storage });

    await expect(store.getAllSessions()).resolves.toEqual([activeSession]);
    expect(storage.setSessions).toHaveBeenCalledWith([activeSession]);

    await store.revokeSession(activeSession.sessionId);

    expect(storage.setSessions).toHaveBeenLastCalledWith([]);
  });
});
