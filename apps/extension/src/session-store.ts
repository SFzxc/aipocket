import { validateStreamPermission, type StreamPermissionInput } from "@aipocket/protocol";

export type AiWalletSession = {
  sessionId: string;
  tabId: number;
  frameId: number;
  origin: string;
  providerId: string;
  models: string[];
  expiresAt: string;
  requestLimit?: number;
  requestCount: number;
};

export type CreateSessionInput = {
  tabId: number;
  frameId: number;
  origin: string;
  providerId: string;
  models: string[];
  requestLimit?: number;
};

export type ValidPermissionInput = StreamPermissionInput;

export type SessionStorageAdapter = {
  getSessions: () => Promise<unknown>;
  setSessions: (sessions: AiWalletSession[]) => Promise<void>;
};

export type SessionStoreOptions = {
  storage?: SessionStorageAdapter;
};

export type SyncSessionStore = {
  createSession: (input: CreateSessionInput) => AiWalletSession;
  getActivePermission: (sessionId: string) => AiWalletSession | null;
  getValidPermission: (input: ValidPermissionInput) => AiWalletSession | null;
  getPermissionsForOrigin: (origin: string, tabId: number, frameId: number) => AiWalletSession[];
  getAllSessions: () => AiWalletSession[];
  incrementRequestCount: (sessionId: string) => AiWalletSession | null;
  revokeSession: (sessionId: string) => void;
  revokeSessionsForTab: (tabId: number) => void;
};

export type AsyncSessionStore = {
  createSession: (input: CreateSessionInput) => Promise<AiWalletSession>;
  getActivePermission: (sessionId: string) => Promise<AiWalletSession | null>;
  getValidPermission: (input: ValidPermissionInput) => Promise<AiWalletSession | null>;
  getPermissionsForOrigin: (origin: string, tabId: number, frameId: number) => Promise<AiWalletSession[]>;
  getAllSessions: () => Promise<AiWalletSession[]>;
  incrementRequestCount: (sessionId: string) => Promise<AiWalletSession | null>;
  revokeSession: (sessionId: string) => Promise<void>;
  revokeSessionsForTab: (tabId: number) => Promise<void>;
};

const SESSION_DURATION_MS = 30 * 60 * 1000;

function isSession(value: unknown): value is AiWalletSession {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AiWalletSession).sessionId === "string" &&
    typeof (value as AiWalletSession).tabId === "number" &&
    typeof (value as AiWalletSession).frameId === "number" &&
    typeof (value as AiWalletSession).origin === "string" &&
    typeof (value as AiWalletSession).providerId === "string" &&
    Array.isArray((value as AiWalletSession).models) &&
    (value as AiWalletSession).models.every((model) => typeof model === "string") &&
    ((value as AiWalletSession).requestLimit === undefined ||
      (Number.isInteger((value as AiWalletSession).requestLimit) && (value as AiWalletSession).requestLimit! >= 1)) &&
    typeof (value as AiWalletSession).requestCount === "number" &&
    typeof (value as AiWalletSession).expiresAt === "string"
  );
}

function normalizeStoredSession(value: unknown): AiWalletSession | null {
  if (isSession(value)) {
    return value;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AiWalletSession).sessionId === "string" &&
    typeof (value as AiWalletSession).tabId === "number" &&
    typeof (value as AiWalletSession).frameId === "number" &&
    typeof (value as AiWalletSession).origin === "string" &&
    Array.isArray((value as AiWalletSession).models) &&
    (value as AiWalletSession).models.every((model) => typeof model === "string") &&
    typeof (value as AiWalletSession).expiresAt === "string"
  ) {
    return { ...(value as AiWalletSession), providerId: "provider_openai", requestCount: 0 };
  }

  return null;
}

export function createSessionStore(): SyncSessionStore;
export function createSessionStore(options: { storage: SessionStorageAdapter }): AsyncSessionStore;
export function createSessionStore(options: SessionStoreOptions = {}): SyncSessionStore | AsyncSessionStore {
  const sessions = new Map<string, AiWalletSession>();
  const storage = options.storage;
  let hydrated = !storage;

  function isActive(session: AiWalletSession) {
    return new Date(session.expiresAt).getTime() > Date.now();
  }

  function loadStoredSessions(storedSessions: unknown) {
    sessions.clear();
    if (!Array.isArray(storedSessions)) {
      return;
    }

    for (const session of storedSessions) {
      const normalized = normalizeStoredSession(session);
      if (normalized) {
        sessions.set(normalized.sessionId, normalized);
      }
    }
  }

  async function hydrate() {
    if (!storage || hydrated) {
      return;
    }

    loadStoredSessions(await storage.getSessions());
    hydrated = true;
  }

  async function persist() {
    if (storage) {
      await storage.setSessions([...sessions.values()]);
    }
  }

  function pruneExpired() {
    let changed = false;
    for (const session of sessions.values()) {
      if (!isActive(session)) {
        sessions.delete(session.sessionId);
        changed = true;
      }
    }
    return changed;
  }

  function getActivePermission(sessionId: string) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (!isActive(session)) {
      sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  function getPermissionsForOrigin(origin: string, tabId: number, frameId: number) {
    pruneExpired();
    return [...sessions.values()].filter(
      (session) => session.origin === origin && session.tabId === tabId && session.frameId === frameId
    );
  }

  function createSessionInMemory(input: CreateSessionInput) {
    const session: AiWalletSession = {
      sessionId: `session_${crypto.randomUUID()}`,
      tabId: input.tabId,
      frameId: input.frameId,
      origin: input.origin,
      providerId: input.providerId,
      models: [...input.models],
      requestLimit: input.requestLimit,
      requestCount: 0,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString()
    };

    sessions.set(session.sessionId, session);
    return session;
  }

  if (storage) {
    return {
      async createSession(input: CreateSessionInput) {
        await hydrate();
        const session = createSessionInMemory(input);
        await persist();
        return session;
      },

      async getActivePermission(sessionId: string) {
        await hydrate();
        const permission = getActivePermission(sessionId);
        await persist();
        return permission;
      },

      async getValidPermission(input: ValidPermissionInput) {
        await hydrate();
        const session = getActivePermission(input.sessionId);
        if (!session) {
          await persist();
          return null;
        }

        const result = validateStreamPermission(session, input);
        return result.ok ? session : null;
      },

      async getPermissionsForOrigin(origin: string, tabId: number, frameId: number) {
        await hydrate();
        const changed = pruneExpired();
        if (changed) {
          await persist();
        }
        return getPermissionsForOrigin(origin, tabId, frameId);
      },

      async getAllSessions() {
        await hydrate();
        const changed = pruneExpired();
        if (changed) {
          await persist();
        }
        return [...sessions.values()];
      },

      async incrementRequestCount(sessionId: string) {
        await hydrate();
        const session = getActivePermission(sessionId);
        if (!session) {
          await persist();
          return null;
        }

        session.requestCount += 1;
        await persist();
        return session;
      },

      async revokeSession(sessionId: string) {
        await hydrate();
        pruneExpired();
        sessions.delete(sessionId);
        await persist();
      },

      async revokeSessionsForTab(tabId: number) {
        await hydrate();
        pruneExpired();
        for (const session of sessions.values()) {
          if (session.tabId === tabId) {
            sessions.delete(session.sessionId);
          }
        }
        await persist();
      }
    };
  }

  return {
    createSession(input: CreateSessionInput) {
      return createSessionInMemory(input);
    },

    getActivePermission,

    getValidPermission(input: ValidPermissionInput) {
      const session = getActivePermission(input.sessionId);
      if (!session) {
        return null;
      }

      const result = validateStreamPermission(session, input);
      return result.ok ? session : null;
    },

    getPermissionsForOrigin,

    getAllSessions() {
      pruneExpired();
      return [...sessions.values()];
    },

    incrementRequestCount(sessionId: string) {
      const session = getActivePermission(sessionId);
      if (!session) {
        return null;
      }

      session.requestCount += 1;
      return session;
    },

    revokeSession(sessionId: string) {
      sessions.delete(sessionId);
    },

    revokeSessionsForTab(tabId: number) {
      for (const session of sessions.values()) {
        if (session.tabId === tabId) {
          sessions.delete(session.sessionId);
        }
      }
    }
  };
}
