import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { query } from "./db";

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** Counts hits per key in a sliding window, stored in the database so it works across serverless instances. */
export async function rateLimit(bucket: string, max: number, windowSec: number): Promise<{ ok: boolean; retryIn: number }> {
  const key = `${bucket}:${await clientIp()}`;
  const rows = await query<{ n: number; wait: number }>(
    `SELECT count(*)::int AS n, COALESCE(ceil($3 - extract(epoch FROM (now() - min(at))))::int, 0) AS wait
     FROM rate_hits WHERE key=$1 AND at > now() - ($2 || ' seconds')::interval`, [key, String(windowSec), windowSec]);
  if (rows[0].n >= max) return { ok: false, retryIn: Math.max(1, rows[0].wait) };
  await query("INSERT INTO rate_hits (key) VALUES ($1)", [key]);
  if (Math.random() < 0.05) await query("DELETE FROM rate_hits WHERE at < now() - interval '1 hour'");
  return { ok: true, retryIn: 0 };
}

/** Validates the display name the browser sends and applies the per-IP write limit. */
export async function guard(name: unknown, bucket = "write", max = 60, windowSec = 60): Promise<{ ok: true; who: string } | { ok: false; error: string }> {
  const who = String(name ?? "").trim().replace(/[<>|]/g, "").slice(0, 40);
  if (who.length < 2) return { ok: false, error: "Please enter your name (2 letters or more) so the log shows who acted." };
  const rl = await rateLimit(bucket, max, windowSec);
  if (!rl.ok) return { ok: false, error: `Too many actions from your network. Try again in ${rl.retryIn} seconds.` };
  return { ok: true, who };
}
