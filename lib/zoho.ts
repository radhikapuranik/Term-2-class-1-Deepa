/** Zoho Self Client on one data centre (default India: accounts.zoho.in, zohoapis.in). Keys come from the environment only. */
export const SCOPES = "ZohoInventory.purchaseorders.CREATE,ZohoInventory.purchaseorders.READ,ZohoInventory.items.READ,ZohoInventory.contacts.READ,ZohoMail.messages.CREATE,ZohoMail.accounts.READ";

const dc = () => process.env.ZOHO_DC || "in";
export const hosts = () => ({ accounts: `https://accounts.zoho.${dc()}`, api: `https://www.zohoapis.${dc()}`, mail: `https://mail.zoho.${dc()}` });

export class ZohoError extends Error {
  constructor(message: string, public status = 0, public easy = message) { super(message); }
}

export const zohoConfigured = () => !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);

let cached: { token: string; exp: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  if (!zohoConfigured()) throw new ZohoError("Zoho is not connected", 0, "Zoho is not connected yet. Fill in the Zoho lines in .env.local (client id, client secret, refresh token).");
  const res = await fetch(`${hosts().accounts}/oauth/v2/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: process.env.ZOHO_CLIENT_ID!, client_secret: process.env.ZOHO_CLIENT_SECRET!, refresh_token: process.env.ZOHO_REFRESH_TOKEN! }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) throw new ZohoError(`Zoho token refused: ${j.error ?? res.status}`, res.status, "Zoho refused the saved login. Create a new Self Client code in api-console.zoho.in with the right scopes and send it to me to exchange.");
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

const scopeHint = `Zoho says a permission is missing. Make a new Self Client code at api-console.zoho.in with exactly these scopes: ${SCOPES}`;

export async function zfetch<T = Record<string, unknown>>(url: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(init.json ? { "Content-Type": "application/json" } : {}) },
    body: init.json ? JSON.stringify(init.json) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* not json */ }
  const code = Number(j.code ?? 0);
  if (!res.ok || (j.code !== undefined && code !== 0)) {
    const msg = String(j.message ?? (j.status as { description?: string })?.description ?? text.slice(0, 120));
    const scope = res.status === 401 || res.status === 403 || code === 57 || /scope|not authorized|permission/i.test(msg);
    throw new ZohoError(`Zoho ${res.status}: ${msg}`, res.status, scope ? scopeHint : `Zoho said: ${msg}`);
  }
  return j as T;
}

export interface MailAccount { accountId: string; address: string }
export async function mailAccount(): Promise<MailAccount> {
  const j = await zfetch<{ data?: { accountId: string; primaryEmailAddress?: string; mailboxAddress?: string }[] }>(`${hosts().mail}/api/accounts`);
  const a = j.data?.[0];
  if (!a) throw new ZohoError("No Zoho Mail account", 0, "This Zoho login has no Zoho Mail mailbox. Open mail.zoho.in once with the same Zoho account so the mailbox is created.");
  return { accountId: String(a.accountId), address: a.primaryEmailAddress ?? a.mailboxAddress ?? "" };
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const a = await mailAccount();
  await zfetch(`${hosts().mail}/api/accounts/${a.accountId}/messages`, { method: "POST", json: { fromAddress: a.address, toAddress: to, subject, content: html, mailFormat: "html" } });
}
