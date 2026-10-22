"use client";
/** The display name lives in this browser only. It is sent with every action and shown in the decision log. */
const KEY = "dd_name";
export function readName(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function saveName(n: string) {
  try { localStorage.setItem(KEY, n.trim().slice(0, 40)); window.dispatchEvent(new Event("dd-name")); } catch { /* storage blocked */ }
}
/** Returns the saved name, asking once if there is none. */
export function getName(): string {
  let n = readName();
  if (n.trim().length < 2) {
    n = (window.prompt("Your name, for the decision log:") ?? "").trim();
    if (n.length >= 2) saveName(n);
  }
  return n;
}
