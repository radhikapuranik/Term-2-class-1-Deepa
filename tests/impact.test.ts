import { describe, expect, it } from "vitest";
import { exportLight, median, overrideLight } from "@/lib/impact";
import { staleBacktest } from "@/lib/backtest";
import { weekRange } from "@/lib/weeks";

const w = (o: number[], d = 10) => o.map((x, i) => ({ week: `w${i}`, overridden: x, decided: d }));
describe("kill criteria", () => {
  it("override: unknown without 4 weeks, red when all 4 above 40%, amber with one, green otherwise", () => {
    expect(overrideLight(w([5, 5])).light).toBe("unknown");
    expect(overrideLight(w([5, 5, 5, 5])).light).toBe("bad");
    expect(overrideLight(w([1, 1, 5, 1])).light).toBe("warn");
    expect(overrideLight(w([1, 2, 1, 2])).light).toBe("good");
    expect(overrideLight(w([4, 4, 4, 4])).light).toBe("good"); // exactly 40% is not above 40%
  });
  it("export reliability", () => {
    expect(exportLight([], 3).light).toBe("unknown");
    expect(exportLight(Array(10).fill({ status: "ok" }), 2).light).toBe("good");
    expect(exportLight([{ status: "ok" }, { status: "failed" }, { status: "failed" }], 2).light).toBe("bad");
  });
  it("median", () => { expect(median([3, 1, 2])).toBe(2); expect(median([])).toBeNull(); });
});

describe("stale-data back-test", () => {
  const weeks = weekRange("2026-W42", 16);
  const flat = weeks.map((week) => ({ sku_id: "A", week, units_sold: 100 }));
  it("flat sales: no error either way", () => {
    const r = staleBacktest(flat)!;
    expect(r.freshErrPct).toBeCloseTo(0, 5);
    expect(r.staleErrPct).toBeCloseTo(0, 5);
  });
  it("a step change makes older data worse", () => {
    const step = weeks.map((week, i) => ({ sku_id: "A", week, units_sold: i >= 12 ? 150 : 100 }));
    const r = staleBacktest(step)!;
    expect(r.staleErrPct).toBeGreaterThan(r.freshErrPct);
  });
  it("returns null without enough history", () => expect(staleBacktest(flat.slice(-3))).toBeNull());
});
