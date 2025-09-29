export interface MediaGroupBufferEntry<TCtx> {
  ctx: TCtx;
  items: unknown[];
  timer: NodeJS.Timeout;
}

export const drainMediaGroupEntry = <TCtx>(
  store: Map<string, MediaGroupBufferEntry<TCtx>>,
  key: string,
): MediaGroupBufferEntry<TCtx> | undefined => {
  const entry = store.get(key);
  if (!entry) return undefined;
  store.delete(key);
  return entry;
};
