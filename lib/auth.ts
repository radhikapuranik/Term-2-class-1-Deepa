import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "desk_session";
const MAX_AGE = 60 * 60 * 12;

const secret = () => process.env.SESSION_SECRET ?? "";
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPasscode(input: string) {
  const p = process.env.DESK_PASSCODE ?? "";
  return p.length > 0 && safeEqual(input.trim(), p);
}

export async function startSession(name: string) {
  const who = (name.trim() || "Raghav (planner)").slice(0, 40).replace(/[|]/g, "");
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${Buffer.from(who).toString("base64url")}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** Returns the signed-in name, or null. */
export async function currentUser(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v || !secret()) return null;
  const [who, exp, sig] = v.split(".");
  if (!who || !exp || !sig) return null;
  if (!safeEqual(sig, sign(`${who}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return Buffer.from(who, "base64url").toString();
}

export async function requireUser(): Promise<string> {
  const u = await currentUser();
  if (!u) throw new Error("Please sign in with the passcode first.");
  return u;
}
