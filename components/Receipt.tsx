import type { TraceLine } from "@/lib/rules/types";

export function Receipt({ skuId, name, trace, asOf }: { skuId: string; name: string; trace: TraceLine[]; asOf?: string | null }) {
  const result = trace.find((t) => t.label === "Result");
  const body = trace.filter((t) => t !== result);
  return (
    <section className="receipt" aria-label={`Rule receipt for ${skuId}`}>
      <h3>Rule receipt</h3>
      <div className="sub">{skuId} · {name}{asOf ? ` · as of ${asOf}` : ""}</div>
      {body.map((t, i) => (
        <div key={i}>
          <div className="ln"><span>{t.label}</span><span className="v">{t.value}</span></div>
          {t.note && <div className="nt">{t.note}</div>}
        </div>
      ))}
      {result && (
        <div className="total">
          <div className="ln hot"><span>RESULT</span><span className="v">{result.value}</span></div>
          {result.note && <div className="nt">{result.note}</div>}
        </div>
      )}
      <div className="nt" style={{ textAlign: "center", marginTop: 10 }}>Numbers come from the rule engine.</div>
    </section>
  );
}
