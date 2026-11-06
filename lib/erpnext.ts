/** ERPNext (Frappe) REST client. Auth is an API key and secret from one ERPNext user; they come from the environment only. */
export class ErpError extends Error {
  constructor(message: string, public status = 0, public easy = message) { super(message); }
}

export const erpUrl = () => (process.env.ERPNEXT_URL ?? "").trim().replace(/\/+$/, "");
export const erpConfigured = () => !!(erpUrl() && process.env.ERPNEXT_API_KEY && process.env.ERPNEXT_API_SECRET);

const serverMessage = (j: Record<string, unknown>): string => {
  try {
    const arr = JSON.parse(String(j._server_messages ?? "[]")) as string[];
    const m = arr.map((x) => (JSON.parse(x) as { message?: string }).message ?? "").filter(Boolean).join(" ");
    if (m) return m.replace(/<[^>]*>/g, "").slice(0, 220);
  } catch { /* not json */ }
  return String(j.exception ?? j.message ?? "").replace(/<[^>]*>/g, "").slice(0, 220);
};

export async function efetch<T = Record<string, unknown>>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  if (!erpConfigured()) throw new ErpError("ERPNext is not connected", 0, "ERPNext is not connected yet. Fill in ERPNEXT_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET in .env.local.");
  let res: Response;
  try {
    res = await fetch(`${erpUrl()}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`, Accept: "application/json", ...(init.json ? { "Content-Type": "application/json" } : {}) },
      body: init.json ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErpError("ERPNext did not answer", 0, "ERPNext did not answer. Check that ERPNEXT_URL is the right address and the site is awake.");
  }
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* not json */ }
  if (res.status === 401 || res.status === 403) throw new ErpError(`ERPNext ${res.status}`, res.status, "ERPNext refused the API key or the user has no permission. Check the key and secret, and give that ERPNext user the Purchase User and Stock User roles.");
  if (!res.ok) { const m = serverMessage(j); throw new ErpError(`ERPNext ${res.status}: ${m || text.slice(0, 100)}`, res.status, `ERPNext said: ${m || `error ${res.status}`}`); }
  return j as T;
}

export const erpLink = (doctype: string, name: string) => `${erpUrl()}/app/${doctype.toLowerCase().replace(/ /g, "-")}/${encodeURIComponent(name)}`;
export const filters = (f: unknown[]) => encodeURIComponent(JSON.stringify(f));
