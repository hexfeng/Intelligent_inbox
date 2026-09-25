import "./env.js";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString });
try {
  const directory = new URL("../db/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), "utf8");
    await pool.query(sql);
  }
  process.stdout.write("Migration complete\n");
} finally {
  await pool.end();
}
