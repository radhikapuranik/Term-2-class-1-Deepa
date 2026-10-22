"use client";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <input type="hidden" name="next" value={next} />
      <div><label htmlFor="name">Your name</label><input id="name" name="name" defaultValue="Raghav (planner)" autoComplete="name" style={{ width: "100%" }} /></div>
      <div><label htmlFor="passcode">Passcode</label><input id="passcode" name="passcode" type="password" required autoComplete="current-password" style={{ width: "100%" }} /></div>
      {state?.error && <div className="banner bad" role="alert">{state.error}</div>}
      <button className="btn primary" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
    </form>
  );
}
