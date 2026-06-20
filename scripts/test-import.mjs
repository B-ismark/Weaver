// Posts the synthetic Pinterest export to the running dev server's /api/import.
// Usage: node scripts/test-import.mjs   (dev server must be running on :3000)
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Optional: node scripts/test-import.mjs <path-to-export-file>
const path =
  process.argv[2] ??
  new URL("../test/fixtures/pinterest-sample.json", import.meta.url);
const bytes = readFileSync(path);
const name = typeof path === "string" ? basename(path) : "pinterest-sample.json";
const type = name.endsWith(".html") ? "text/html" : "application/json";

const form = new FormData();
form.set("platform", "pinterest");
form.set("file", new File([bytes], name, { type }));

const res = await fetch("http://localhost:3000/api/import", { method: "POST", body: form });
const body = await res.json();
console.log("status:", res.status);
console.log(JSON.stringify(body, null, 2));
