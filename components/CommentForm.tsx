"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/app/workflow";

export function CommentForm({ skuId }: { skuId: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addComment(skuId, text); if (r.ok) { setText(""); setErr(""); router.refresh(); } else setErr(r.error); }); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <label htmlFor="cm" className="sr">Add a comment</label>
      <input id="cm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the team" style={{ flex: 1, minWidth: 200 }} maxLength={500} />
      <button className="btn sm" disabled={pending || !text.trim()}>Add</button>
      {err && <span role="alert" className="small" style={{ color: "var(--stockout)" }}>{err}</span>}
    </form>
  );
}
