import Link from "next/link";
import type { Run } from "@/lib/queries";
import { dateIst, dateTimeIst, ago, monthName } from "@/lib/format";

export function Banners({ run, demo, upliftOff, basePath }: { run: Run | null; demo: boolean; upliftOff?: boolean; basePath: string }) {
  return (
    <>
      {demo && run?.as_of && (
        <div className="banner demo" role="note"><b>Demo data, as of {dateIst(run.as_of)}.</b> <span className="muted">15 sample SKUs. Upload your own files on the Data page.</span></div>
      )}
      {run && (
        <div className="banner" aria-live="polite">
          <span><span className="label">Data as of</span> <b className="mono">{dateIst(run.as_of)}</b></span>
          <span className="muted">·</span>
          <span><span className="label">Run #{run.id}</span> <span className="mono">{dateTimeIst(run.finished_at ?? run.started_at)}</span> ({ago(run.finished_at ?? run.started_at)})</span>
          <span className="muted">·</span>
          <span>
            {upliftOff ? <b>Preview: festival uplift OFF (not saved).</b> : run.uplift_applied
              ? <b>Festival uplift is ON for {monthName(run.as_of?.slice(0, 7) ?? null)}: +25% expected demand.</b>
              : <span>No festival uplift this month.</span>}{" "}
            <Link href={upliftOff ? basePath : `${basePath}?uplift=off`} className="small">{upliftOff ? "Back to the saved run" : "See it without the uplift"}</Link>
          </span>
        </div>
      )}
    </>
  );
}
