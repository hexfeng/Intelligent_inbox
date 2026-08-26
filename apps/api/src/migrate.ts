import "./env.js";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString });
try {
  const sql = await readFile(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8");
  await pool.query(sql);
  process.stdout.write("Migration complete\n");
} finally {
  await pool.end();
}
