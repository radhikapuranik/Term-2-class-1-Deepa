import { describe, expect, it } from "vitest";
import { explainInput, validateExplanation, templateExplanation } from "@/lib/gemini";
import { runEngine } from "@/lib/rules/engine";
import { DEFAULT_SETTINGS } from "@/lib/rules/types";
import { loadSeedFiles } from "@/lib/seed-data";

const out = runEngine({ ...loadSeedFiles(), settings: DEFAULT_SETTINGS });
const r = out.results.find((x) => x.sku_id === "SKU003")!;
const input = explainInput(r, true);
const good = { sku_id: "SKU003", plain_explanation: "Brown rice has 4.4 weeks of cover, below the 6 week minimum.", question_for_planner: "Do you want to add more than 300 units?", watch_out: "Cover stays under 6 even after the order." };

describe("Gemini output validator", () => {
  it("accepts output built from supplied numbers", () => expect(validateExplanation(good, input).ok).toBe(true));
  it("rejects a number that was not supplied", () => {
    const v = validateExplanation({ ...good, plain_explanation: "Sales will grow by 37 percent next week." }, input);
    expect(v.ok).toBe(false);
  });
  it("rejects URLs", () => expect(validateExplanation({ ...good, watch_out: "See https://example.com for more detail." }, input).ok).toBe(false));
  it("rejects another SKU id", () => expect(validateExplanation({ ...good, watch_out: "Compare with SKU004 before ordering." }, input).ok).toBe(false));
  it("rejects a wrong sku_id and wrong shape", () => {
    expect(validateExplanation({ ...good, sku_id: "SKU001" }, input).ok).toBe(false);
    expect(validateExplanation({ sku_id: "SKU003" }, input).ok).toBe(false);
  });
  it("the plain template always passes its own rules", () => {
    expect(validateExplanation(templateExplanation(r), input).ok).toBe(true);
  });
});
