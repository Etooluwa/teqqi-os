import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "teqqi-phase8-foundation-"));

async function compile(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const outPath = path.join(tempDir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await fs.writeFile(outPath, output.replaceAll('from "./types"', 'from "./types.mjs"'));
  return outPath;
}

await compile("lib/website-opportunities/types.ts");
await compile("lib/website-opportunities/config.ts");
const config = await import(pathToFileURL(path.join(tempDir, "config.mjs")));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("\nTEQQI OS Phase 8 — Opportunity Engine Foundation smoke test\n");

assert(config.OPPORTUNITY_ENGINE_VERSION === "1.0.0", "Expected versioned opportunity configuration.");
console.log("✓ Opportunity Engine configuration is versioned");

assert(config.WEBSITE_OPPORTUNITY_TYPES.length === 9, "Expected nine approved website opportunity types.");
assert(new Set(config.WEBSITE_OPPORTUNITY_TYPES).size === 9, "Opportunity types must be unique.");
console.log("✓ Website-only opportunity taxonomy is controlled and unique");

const mapped = Object.entries(config.WEBSITE_SERVICE_BY_OPPORTUNITY);
assert(mapped.length === config.WEBSITE_OPPORTUNITY_TYPES.length, "Every opportunity must have one primary website service mapping.");
for (const type of config.WEBSITE_OPPORTUNITY_TYPES) {
  assert(config.WEBSITE_SERVICE_BY_OPPORTUNITY[type], `Missing service mapping for ${type}.`);
}
console.log("✓ Every approved website opportunity maps to an approved website service");

const prohibited = new Set(config.PROHIBITED_WEBSITE_ONLY_SERVICE_IDS);
for (const serviceId of Object.values(config.WEBSITE_SERVICE_BY_OPPORTUNITY)) {
  assert(!prohibited.has(serviceId), `${serviceId} must not be inferred from website evidence alone.`);
}
console.log("✓ Internal Tool, CRM, Customer Portal, AI Automation, Mobile App, Booking System, and E-commerce are excluded from website-only inference");

assert(!config.WEBSITE_OPPORTUNITY_TYPES.includes("LEAD_SCORE"), "Lead Score must remain separate from opportunity taxonomy.");
assert(!Object.keys(config.WEBSITE_SERVICE_BY_OPPORTUNITY).includes("LEAD_PRIORITY"), "Lead priority must remain downstream.");
console.log("✓ Opportunity generation remains separate from commercial Lead Scoring");

console.log("\nPhase 8 Opportunity Engine foundation smoke test passed.\n");
