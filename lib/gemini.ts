import { createHash } from "node:crypto";
import { z } from "zod";
import { query } from "./db";
import { simulate } from "./simulate";
import { blocked } from "./kill";
import type { SkuResult } from "./rules/types";

export const ExplanationSchema = z.object({
  sku_id: z.string(),
  plain_explanation: z.string().min(10).max(700),
  question_for_planner: z.string().min(5).max(300),
  watch_out: z.string().min(5).max(300),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

const f1 = (n: number | null) => (n == null ? null : n.toFixed(1));

/** The finished numbers Gemini may talk about. Nothing else is sent. */
export function explainInput(r: SkuResult, upliftOn: boolean) {
  return {
    sku_id: r.sku_id, sku_name: r.sku_name, perishable: r.perishable, status: r.status, high_demand: r.highDemand,
    action: r.action, recommended_qty: r.qty, weeks_of_cover: f1(r.cover), cover_after_order: f1(r.coverAfter),
    safe_range_weeks: `${r.minWeeks} to ${r.maxWeeks}`, avg_last_4_weeks: f1(r.avg4), avg_12_weeks: f1(r.avg12),
    weekly_demand_used: f1(r.demand), stock_on_hand: r.onHand, festival_uplift_on: upliftOn,
    advisory_top_up_units: r.advisoryTopUp, flags: r.exceptions.map((e) => e.message), rule_trace: r.trace.map((t) => `${t.label}: ${t.value}${t.note ? ` (${t.note})` : ""}`),
  };
}

const NUM = /\d+(?:\.\d+)?/g;
const nums = (s: string) => (s.match(NUM) ?? []).map(Number);

/** Rejects anything that is not strictly built from the supplied facts. */
export function validateExplanation(raw: unknown, input: ReturnType<typeof explainInput>): { ok: true; value: Explanation } | { ok: false; reason: string } {
  const p = ExplanationSchema.safeParse(raw);
  if (!p.success) return { ok: false, reason: "wrong shape" };
  const v = p.data;
  if (v.sku_id !== input.sku_id) return { ok: false, reason: "wrong sku id" };
  const text = `${v.plain_explanation} ${v.question_for_planner} ${v.watch_out}`;
  if (/https?:\/\/|www\.|\.com\b|\.in\b/i.test(text)) return { ok: false, reason: "contains a link" };
  const otherSku = (text.match(/SKU\d+/gi) ?? []).find((s) => s.toUpperCase() !== input.sku_id);
  if (otherSku) return { ok: false, reason: "mentions another SKU" };
  const allowed = new Set(nums(JSON.stringify(input)));
  const bad = nums(text).find((n) => !allowed.has(n));
  if (bad !== undefined) return { ok: false, reason: `number ${bad} was not supplied` };
  return { ok: true, value: v };
}

export function templateExplanation(r: SkuResult): Explanation {
  const first = r.exceptions[0]?.message ?? "This SKU needs a planner's judgment.";
  const cover = r.cover != null ? `Cover is ${r.cover.toFixed(1)} weeks against a safe range of ${r.minWeeks} to ${r.maxWeeks}. ` : "";
  return {
    sku_id: r.sku_id,
    plain_explanation: `${cover}${first}`.trim(),
    question_for_planner: r.action === "review" ? "Do you want to order, hold, or wait for next week's numbers?" : "Does the recommendation still look right to you?",
    watch_out: r.exceptions.length > 1 ? r.exceptions[1].message : "Check the rule receipt for the full calculation.",
  };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    sku_id: { type: "STRING" }, plain_explanation: { type: "STRING" }, question_for_planner: { type: "STRING" }, watch_out: { type: "STRING" },
  },
  required: ["sku_id", "plain_explanation", "question_for_planner", "watch_out"],
};

const SYSTEM = `You help a demand planner understand why a product was flagged. You never calculate, never change a quantity and never decide.
Write in short, plain English with no jargon. Use ONLY numbers that appear in the input JSON, copied exactly. Do not write any other digits.
Do not mention other SKUs and do not include links. Return JSON: plain_explanation (2 to 3 short sentences saying why it was flagged), question_for_planner (one question the planner should answer), watch_out (one short sentence on what to double-check).`;

async function callGemini(input: ReturnType<typeof explainInput>): Promise<unknown> {
  if (simulate("gemini")) throw new Error("Simulated Gemini outage");
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL;
  if (!key || !model) throw new Error("Gemini is not configured");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => typeof p.text === "string")?.text;
  if (!text) throw new Error("Gemini returned no text");
  return JSON.parse(text);
}

export interface ExplainOutcome { value: Explanation; status: "ai" | "cache" | "fallback" }

/** One validated explanation: cache, then up to 3 attempts (1 + 2 retries), then the plain template. */
export async function explainOne(r: SkuResult, upliftOn: boolean): Promise<ExplainOutcome> {
  if (await blocked("gemini")) return { value: templateExplanation(r), status: "fallback" };
  const input = explainInput(r, upliftOn);
  const hash = createHash("sha256").update(`${process.env.GEMINI_MODEL}|${JSON.stringify(input)}`).digest("hex");
  if (!simulate("gemini")) {
    const hit = await query<{ output: Explanation }>("SELECT output FROM ai_cache WHERE input_hash=$1", [hash]).catch(() => []);
    if (hit[0]) return { value: hit[0].output, status: "cache" };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const v = validateExplanation(await callGemini(input), input);
      if (v.ok) {
        await query("INSERT INTO ai_cache (input_hash, output) VALUES ($1,$2) ON CONFLICT DO NOTHING", [hash, JSON.stringify(v.value)]).catch(() => {});
        return { value: v.value, status: "ai" };
      }
    } catch {
      if (simulate("gemini")) break;
    }
  }
  return { value: templateExplanation(r), status: "fallback" };
}

export const MAX_EXPLAINED = 25;
