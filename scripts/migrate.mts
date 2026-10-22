import { readFileSync } from "node:fs";
import { query } from "../lib/db.ts";

const sql = readFileSync("db/schema.sql", "utf8").replace(/^--.*$/gm, "");
const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
for (const s of statements) await query(s);
console.log(`schema applied (${statements.length} statements)`);
