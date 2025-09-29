export interface MergedArrayPayload {
  keys: string[];
  merged: Record<string, unknown>;
}

export const mergeArrayObjectSamples = (
  payload: unknown[],
  headSamples = 5,
  totalSamples = 8,
): MergedArrayPayload => {
  if (!payload.length) return { keys: [], merged: {} };
  const indices: number[] = [];
  const headCount = Math.min(payload.length, Math.max(headSamples, 0));
  for (let i = 0; i < headCount; i += 1) indices.push(i);
  const tailCount = Math.min(payload.length - headCount, Math.max(totalSamples - headCount, 0));
  for (let i = payload.length - tailCount; i < payload.length; i += 1) {
    if (i >= 0) indices.push(i);
  }
  const seenIndices = new Set<number>();
  const merged: Record<string, unknown> = {};
  const orderedKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const index of indices) {
    if (seenIndices.has(index)) continue;
    seenIndices.add(index);
    const item = payload[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (!seenKeys.has(key)) {
        orderedKeys.push(key);
        seenKeys.add(key);
      }
      if (!(key in merged)) {
        merged[key] = (item as Record<string, unknown>)[key];
      }
    }
  }
  return { keys: orderedKeys, merged };
};
