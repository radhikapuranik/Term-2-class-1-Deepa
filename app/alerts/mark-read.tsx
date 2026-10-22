"use client";
import { useRouter } from "next/navigation";
import { markAllRead } from "./actions";

export function MarkRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  return <button className="btn sm" disabled={disabled} onClick={async () => { await markAllRead(); router.refresh(); }}>Mark all as read</button>;
}
