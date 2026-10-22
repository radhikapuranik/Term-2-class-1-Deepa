import Link from "next/link";
import { RecTable } from "@/components/RecTable";
import { Banners } from "@/components/DeskBanners";
import { currentUser } from "@/lib/auth";
import { isDemoData, latestRun, previewRecs, recsForRun } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "All SKUs" };

export default async function Page({ searchParams }: PageProps<"/recommendations">) {
  const sp = await searchParams;
  const upliftOff = sp.uplift === "off";
  const [run, demo, user] = await Promise.all([latestRun(), isDemoData(), currentUser()]);
  if (!run) return <div className="empty">No analysis yet. <Link href="/data">Load data</Link>.</div>;
  const recs = upliftOff ? await previewRecs(false) : await recsForRun(run.id);
  const dists = [...new Set(recs.map((r) => r.distributor_id))].sort();
  return (
    <>
      <Banners run={run} demo={demo} upliftOff={upliftOff} basePath="/recommendations" />
      <h1 style={{ font: "700 2rem var(--f-display)", marginBottom: 14 }}>All SKUs</h1>
      <RecTable recs={recs} initialStatus={typeof sp.status === "string" ? sp.status : undefined} distributors={dists} readOnly={upliftOff} signedIn={!!user} />
    </>
  );
}
