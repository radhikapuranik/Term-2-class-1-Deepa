import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

function conn() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return (client ??= neon(process.env.DATABASE_URL));
}

/** Runs a parameterised query. Neon can be asleep, so the first failure is retried once. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await conn().query(text, params)) as T[];
  } catch (e) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      return (await conn().query(text, params)) as T[];
    } catch {
      throw e;
    }
  }
}

/** Runs several statements as one transaction (all or nothing). */
export async function transaction(statements: { text: string; params?: unknown[] }[]) {
  const sql = conn();
  return sql.transaction((tx) => statements.map((s) => tx.query(s.text, s.params ?? [])));
}
