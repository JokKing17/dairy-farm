export function normalizeSearchQuery(value: string | undefined, maxLength = 80) {
  return value?.trim().slice(0, maxLength) ?? "";
}

export function escapedSearchPattern(value: string | undefined, maxLength = 80) {
  const query = normalizeSearchQuery(value, maxLength);
  return query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
}
