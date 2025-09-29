import type { DiffReport } from "./notifier.js";
import type { Status } from "./registry_status.js";

interface MutableDiff {
  scopes: Map<string, Status>;
  messageKeys: Map<string, { scope: string; key: string; status: Status; sample?: string }>;
  entityTypes: Map<string, { scope: string; type: string; status: Status }>;
}

const createMutableDiff = (): MutableDiff => ({
  scopes: new Map(),
  messageKeys: new Map(),
  entityTypes: new Map(),
});

const mergeDiff = (target: MutableDiff, incoming: DiffReport) => {
  if (incoming.newScopes) {
    for (const scope of incoming.newScopes) {
      target.scopes.set(scope.scope, scope.status);
    }
  }
  if (incoming.newMessageKeys) {
    for (const entry of incoming.newMessageKeys) {
      const key = `${entry.scope}:${entry.key}`;
      if (!target.messageKeys.has(key) || !target.messageKeys.get(key)?.sample) {
        target.messageKeys.set(key, { scope: entry.scope, key: entry.key, status: entry.status, sample: entry.sample });
      }
    }
  }
  if (incoming.newEntityTypes) {
    for (const entry of incoming.newEntityTypes) {
      const key = `${entry.scope}:${entry.type}`;
      target.entityTypes.set(key, { scope: entry.scope, type: entry.type, status: entry.status });
    }
  }
};

const materializeDiff = (source: MutableDiff): DiffReport => {
  const newScopes = Array.from(source.scopes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([scope, status]) => ({ scope, status }));
  const newMessageKeys = Array.from(source.messageKeys.values())
    .sort((a, b) => (a.scope === b.scope ? a.key.localeCompare(b.key) : a.scope.localeCompare(b.scope)));
  const newEntityTypes = Array.from(source.entityTypes.values())
    .sort((a, b) => (a.scope === b.scope ? a.type.localeCompare(b.type) : a.scope.localeCompare(b.scope)));
  const diff: DiffReport = {};
  if (newScopes.length) diff.newScopes = newScopes;
  if (newMessageKeys.length) diff.newMessageKeys = newMessageKeys;
  if (newEntityTypes.length) diff.newEntityTypes = newEntityTypes;
  return diff;
};

interface PendingNotice<TCtx> {
  diff: MutableDiff;
  timer: NodeJS.Timeout;
  context: TCtx;
  replyTo?: number;
}

export interface RegistryNotifierOptions<TCtx> {
  debounceMs?: number;
  onFlush: (payload: { chatId: number; diff: DiffReport; context: TCtx; replyTo?: number }) => void | Promise<void>;
}

export interface QueueNotice<TCtx> {
  diff: DiffReport;
  context: TCtx;
  replyTo?: number;
}

export interface RegistryNotifier<TCtx> {
  queue: (chatId: number, payload: QueueNotice<TCtx>) => void;
  flush: (chatId: number) => Promise<void>;
  flushAll: () => Promise<void>;
  hasPending: (chatId: number) => boolean;
}

export const createRegistryNotifier = <TCtx>(options: RegistryNotifierOptions<TCtx>): RegistryNotifier<TCtx> => {
  const debounceMs = Math.max(0, options.debounceMs ?? 750);
  const pending = new Map<number, PendingNotice<TCtx>>();

  const disposeTimer = (entry: PendingNotice<TCtx>) => {
    try {
      clearTimeout(entry.timer);
    } catch {
      // ignore
    }
  };

  const flush = async (chatId: number) => {
    const entry = pending.get(chatId);
    if (!entry) return;
    pending.delete(chatId);
    disposeTimer(entry);
    const diff = materializeDiff(entry.diff);
    if (!diff.newScopes && !diff.newMessageKeys && !diff.newEntityTypes) return;
    try {
      await options.onFlush({ chatId, diff, context: entry.context, replyTo: entry.replyTo });
    } catch (error) {
      console.warn("[registry-notifier] Failed to deliver notice", error);
    }
  };

  return {
    queue(chatId, payload) {
      const existing = pending.get(chatId);
      if (existing) {
        mergeDiff(existing.diff, payload.diff);
        const replyTo = payload.replyTo ?? existing.replyTo;
        disposeTimer(existing);
        const timer = setTimeout(() => {
          void flush(chatId);
        }, debounceMs);
        pending.set(chatId, { diff: existing.diff, replyTo, context: payload.context, timer });
        return;
      }
      const diff = createMutableDiff();
      mergeDiff(diff, payload.diff);
      const timer = setTimeout(() => {
        void flush(chatId);
      }, debounceMs);
      pending.set(chatId, { diff, context: payload.context, replyTo: payload.replyTo, timer });
    },
    flush,
    async flushAll() {
      const chatIds = Array.from(pending.keys());
      for (const chatId of chatIds) {
        await flush(chatId);
      }
    },
    hasPending(chatId) {
      return pending.has(chatId);
    },
  };
};
