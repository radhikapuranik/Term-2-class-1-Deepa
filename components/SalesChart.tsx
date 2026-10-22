import { weekMondayIso } from "@/lib/weeks";
import { n1 } from "@/lib/format";

interface Props {
  sales: { week: string; units_sold: number }[];
  festival: Map<string, boolean>;
  avg12: number | null;
  windowWeeks: number;
  annotation?: { text: string; kind: "stockout" | "overstock" | "ok" };
  title: string;
}

export function SalesChart({ sales, festival, avg12, windowWeeks, annotation, title }: Props) {
  const W = 680, H = 270, L = 44, R = 16, T = 22, B = 44;
  if (sales.length === 0) return <div className="empty">No sales history yet.</div>;
  const maxV = Math.max(...sales.map((s) => s.units_sold), avg12 ?? 0);
  const top = Math.ceil((maxV * 1.12) / 10) * 10 || 10;
  const x = (i: number) => L + (sales.length === 1 ? 0 : (i * (W - L - R)) / (sales.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const step = (W - L - R) / Math.max(1, sales.length - 1);
  const path = sales.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.units_sold).toFixed(1)}`).join(" ");
  const monthOf = (w: string) => weekMondayIso(w)?.slice(0, 7) ?? "";
  const festIdx = sales.map((s, i) => (festival.get(monthOf(s.week)) ? i : -1)).filter((i) => i >= 0);
  const festSpans: { a: number; b: number; ym: string }[] = [];
  for (const i of festIdx) {
    const last = festSpans[festSpans.length - 1];
    if (last && last.b === i - 1 && last.ym === monthOf(sales[i].week)) last.b = i; else festSpans.push({ a: i, b: i, ym: monthOf(sales[i].week) });
  }
  const n = sales.length;
  const winStart = Math.max(0, n - windowWeeks);
  const l4 = Math.max(0, n - 4);
  const ticks = [0, Math.round(top / 2), top];
  const last = sales[n - 1];
  const summary = `${title}. ${n} weeks of sales from ${sales[0].week} to ${last.week}. Latest week ${last.units_sold} units. 12-week average ${n1(avg12)}.`;
  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      {festSpans.map((s) => (
        <g key={s.a}>
          <rect className="fest" x={x(s.a) - step / 2} y={T} width={(s.b - s.a + 1) * step} height={H - T - B} />
          <text x={x(s.b) + step / 2 - 4} y={T + 12} textAnchor="end" className="t-ink">Festival ({monthLabel(s.ym)})</text>
        </g>
      ))}
      <rect className="l4" x={x(l4) - step / 2} y={T} width={(n - l4) * step} height={H - T - B} />
      <text x={x(l4) - step / 2 + 4} y={H - B - 6}>last 4 wks</text>
      {ticks.map((t) => (
        <g key={t}>
          <line className="axis" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end">{t}</text>
        </g>
      ))}
      {avg12 != null && (
        <g>
          <line className="avg" x1={x(winStart)} x2={x(n - 1)} y1={y(avg12)} y2={y(avg12)} />
          <text x={x(winStart) + 4} y={y(avg12) - 6} style={{ fill: "var(--brand)" }}>12-wk avg {n1(avg12)}</text>
        </g>
      )}
      <path className="line" d={path} />
      {sales.map((s, i) => <circle key={s.week} className="dot" cx={x(i)} cy={y(s.units_sold)} r={i === n - 1 ? 4.5 : 2.4} />)}
      {sales.map((s, i) => (i % 3 === 0 || i === n - 1) && (
        <text key={s.week} x={x(i)} y={H - B + 16} textAnchor="middle">{s.week.slice(5)}</text>
      ))}
      <text x={x(n - 1) - 8} y={y(last.units_sold) + 18} textAnchor="end" className="t-ink">{last.units_sold} units</text>
      {annotation && (
        <g>
          <circle className={`mark-${annotation.kind}`} cx={W - R - 4} cy={H - 10} r={4} />
          <text x={W - R - 14} y={H - 6} textAnchor="end" className="t-ink">{annotation.text}</text>
        </g>
      )}
      <text x={L} y={H - 6}>weeks (ISO), units sold per week</text>
    </svg>
  );
}
