import { Resend } from "resend";
import { simulate } from "./simulate";
import type { EngineOutput } from "./rules/types";
import { dateIst } from "./format";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function digestHtml(out: EngineOutput, runId: number, appUrl: string): { subject: string; html: string } {
  const need = out.results.filter((r) => r.action === "reorder" || r.action === "pause" || r.action === "review" || r.status === "exception");
  const rows = need.slice(0, 12).map((r) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #E2DFD4"><b>${esc(r.sku_name.replace("Freshroots ", ""))}</b><br><span style="color:#5E6B63;font-size:12px">${r.sku_id}</span></td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #E2DFD4">${esc(r.headline)}</td><td style="padding:6px 10px;border-bottom:1px solid #E2DFD4;text-align:right">${r.cover == null ? "–" : r.cover.toFixed(1)} wks</td></tr>`).join("");
  const s = out.summary;
  const subject = `Demand Desk: ${need.length} of ${out.results.length} SKUs need a decision (data as of ${dateIst(out.asOf)})`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#14211B;max-width:620px;margin:auto;background:#F6F4EE;padding:20px">
<h2 style="margin:0 0 4px">${need.length} of ${out.results.length} SKUs need a decision</h2>
<p style="margin:0 0 14px;color:#5E6B63">Data as of ${dateIst(out.asOf)} · run #${runId}${out.upliftApplied ? " · festival uplift on" : ""}</p>
<p>${s.stockout} at stockout risk · ${s.highDemand} with rising demand · ${s.overstock} overstocked · ${s.exceptions} exceptions</p>
<table style="width:100%;border-collapse:collapse;background:#fff;font-size:14px">${rows}</table>
<p style="margin-top:18px"><a href="${esc(appUrl)}" style="background:#1F6B45;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open Demand Desk</a></p>
<p style="color:#5E6B63;font-size:12px">Demand Desk recommends; it never places an order. Explanations written by Gemini; numbers come from the rule engine.</p></div>`;
  return { subject, html };
}

/** Sends the digest, retrying up to 3 times. Returns how many attempts it took, or an error. */
export async function sendDigest(out: EngineOutput, runId: number): Promise<{ ok: boolean; attempts: number; error?: string }> {
  const to = process.env.DIGEST_TO_EMAIL, key = process.env.RESEND_API_KEY;
  if (!to || !key) return { ok: false, attempts: 0, error: "Email is not configured" };
  const { subject, html } = digestHtml(out, runId, process.env.APP_URL ?? "");
  const resend = new Resend(key);
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (simulate("email")) throw new Error("Simulated email failure");
      const { error } = await resend.emails.send({ from: "Demand Desk <onboarding@resend.dev>", to, subject, html });
      if (!error) return { ok: true, attempts: attempt };
      last = error.message;
    } catch (e) {
      last = (e as Error).message;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  return { ok: false, attempts: 3, error: last.slice(0, 200) };
}
