/* Strips undefined props and turns undefined/sparse array slots into null, so positional
   arrays like xpTriggers keep their indices instead of relying on the SDK's undefined handling. */
export function firestoreSafe<T>(value: T): T {
  if (Array.isArray(value)) {
    return Array.from(value, v => (v === undefined ? null : firestoreSafe(v))) as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = firestoreSafe(v);
    }
    return out as T;
  }
  return value;
}
