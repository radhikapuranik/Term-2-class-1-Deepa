import { query } from "../lib/db.ts";
import { loadSeedFiles } from "../lib/seed-data.ts";
import { saveDataset } from "../lib/store.ts";
import { runAnalysis } from "../lib/pipeline.ts";

const ds = loadSeedFiles();
await saveDataset(ds);
await query("INSERT INTO import_batches (source, counts, status) VALUES ('seed', $1, 'ok')", [JSON.stringify({
  skus: ds.skus.length, sales: ds.sales.length, inventory: ds.inventory.length,
  distributors: ds.distributors.length, calendar: ds.calendar.length,
})]);
const { runId, out } = await runAnalysis("seed");
console.log(`seeded ${ds.skus.length} SKUs; first run #${runId}:`, JSON.stringify(out.summary));
