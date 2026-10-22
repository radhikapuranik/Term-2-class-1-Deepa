"use client";
import { useSyncExternalStore } from "react";
import { readName, saveName } from "@/lib/client-name";

const sub = (cb: () => void) => { window.addEventListener("dd-name", cb); window.addEventListener("storage", cb); return () => { window.removeEventListener("dd-name", cb); window.removeEventListener("storage", cb); }; };

export function NameChip() {
  const name = useSyncExternalStore(sub, readName, () => "");
  return (
    <div>
      <label htmlFor="dd-name" className="small" style={{ marginBottom: 2 }}>Your name (for the log)</label>
      <input id="dd-name" defaultValue={name} key={name} placeholder="Type your name" maxLength={40} style={{ width: "100%", minHeight: 34, padding: "6px 8px" }}
        onBlur={(e) => saveName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}
