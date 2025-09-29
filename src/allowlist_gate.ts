export const runIfAllowlisted = <T>(
  allowlist: Set<string>,
  userId: string | undefined | null,
  onAllowed: () => T,
  onBlocked?: () => T,
): T | undefined => {
  if (!allowlist.size) return onAllowed();
  const trimmed = userId?.trim();
  if (!trimmed || !allowlist.has(trimmed)) {
    return onBlocked ? onBlocked() : undefined;
  }
  return onAllowed();
};

export const isUserAllowlisted = (allowlist: Set<string>, userId: string | undefined | null): boolean => {
  if (!allowlist.size) return true;
  const trimmed = userId?.trim();
  if (!trimmed) return false;
  return allowlist.has(trimmed);
};
