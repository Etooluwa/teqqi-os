import { spawn } from "node:child_process";

const TARGET = process.env.TEQQI_APP_URL ?? "http://localhost:3000";

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: { ...process.env, TEQQI_APP_URL: TARGET },
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} failed with exit code ${code}.`)));
  });
}

console.log("\nTEQQI OS Phase 11 — MVP Release gate");
console.log(`Target app: ${TARGET}\n`);

const releaseGates = [
  "scripts/phase11-deployment-readiness-smoke-test.mjs",
  "scripts/phase11-market-auto-analysis-smoke-test.mjs",
  "scripts/phase11-end-to-end-smoke-test.mjs",
  "scripts/phase11-security-review-smoke-test.mjs",
  "scripts/phase11-logging-monitoring-smoke-test.mjs",
  "scripts/phase11-performance-review-smoke-test.mjs",
  "scripts/phase10-final-smoke-test.mjs",
];

for (const script of releaseGates) {
  await runScript(script);
}

console.log("\n✅ TEQQI OS MVP release gate passed. Critical deployment, automatic market analysis, E2E, security, monitoring, performance, and Phase 10 product contracts are verified.\n");
