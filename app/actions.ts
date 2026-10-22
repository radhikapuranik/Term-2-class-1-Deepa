"use server";
import { redirect } from "next/navigation";
import { checkPasscode, endSession, startSession } from "@/lib/auth";

const attempts = new Map<string, { n: number; until: number }>();

export async function login(_: { error?: string } | undefined, form: FormData) {
  const key = "global";
  const a = attempts.get(key);
  if (a && a.until > Date.now() && a.n >= 5) return { error: "Too many wrong tries. Wait a minute and try again." };
  if (!checkPasscode(String(form.get("passcode") ?? ""))) {
    attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 60_000 });
    return { error: "That passcode is not right." };
  }
  attempts.delete(key);
  await startSession(String(form.get("name") ?? ""));
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/");
}
