/** A tiny in-memory stand-in for the database, matched on the SQL text, for tests that must not touch Neon. */
export type Handler = (text: string, params: unknown[]) => unknown[] | undefined;
export function makeDb(handlers: Handler[]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const query = async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    for (const h of handlers) { const r = h(text, params); if (r) return r; }
    return [];
  };
  return { query, calls, transaction: async () => [] };
}
