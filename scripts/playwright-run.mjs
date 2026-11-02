#!/usr/bin/env node
// Builds a self-contained `async (page) => {...}` file for Playwright MCP's browser_run_code
// (`filename` parameter). Playwright MCP cannot pass arguments to run_code, so the plan is
// embedded in the generated file together with scripts/ubw-page.js.
//
// Usage:
//   scripts/playwright-run.mjs <plan.json> <out.js>
//
// plan.json is an array of steps, executed in order; execution stops at the first failed step:
//   { "op": "status" }
//   { "op": "readLines" }
//   { "op": "listTasks" }
//   { "op": "listAbsenceCodes" }
//   { "op": "addWorkLine", "workOrder": "...", "activity": "", "day": 1, "hours": 7.5, "description": "..." }
//   { "op": "addAbsence", "code": "...", "day": 4, "hours": 4.5, "description": "" }
//   { "op": "saveDraft" }
//   { "op": "changePeriod", "direction": -1 }
//   { "op": "expectPeriod", "period": "202643" }
//   { "op": "expectDayTotals", "dayTotals": [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0] }
//
// Submission ("Sende til godkjenning") is deliberately not an op: the user does it, or the agent
// does it only after explicit confirmation.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [planPath, outPath] = process.argv.slice(2);
if (!planPath || !outPath) {
  console.error("Usage: playwright-run.mjs <plan.json> <out.js>");
  process.exit(2);
}

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
if (!Array.isArray(plan)) throw new Error("Plan must be a JSON array of steps.");

const allowed = new Set([
  "status", "readLines", "listTasks", "listAbsenceCodes", "addWorkLine", "addAbsence",
  "saveDraft", "changePeriod", "expectPeriod", "expectDayTotals",
]);
for (const step of plan) {
  if (!allowed.has(step.op)) throw new Error(`Unknown op: ${step.op}`);
  if (step.description && step.description.length > 240) {
    throw new Error(`Description over 240 chars (${step.description.length}): ${step.description.slice(0, 60)}...`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const helper = fs.readFileSync(path.join(here, "ubw-page.js"), "utf8");

const code = `async (page) => {
  const PLAN = ${JSON.stringify(plan)};
  await page.evaluate(${JSON.stringify(helper)});
  const results = [];
  for (const step of PLAN) {
    let result;
    try {
      if (step.op === "expectPeriod") {
        const s = await page.evaluate(() => window.__ubw.status());
        result = { ok: s.period === step.period, expected: step.period, actual: s.period };
      } else if (step.op === "expectDayTotals") {
        const s = await page.evaluate(() => window.__ubw.status());
        const ok = step.dayTotals.every((h, i) => Math.abs((s.dayTotals[i] || 0) - h) < 0.001);
        result = { ok, expected: step.dayTotals, actual: s.dayTotals };
      } else if (step.op === "changePeriod") {
        result = await page.evaluate((d) => window.__ubw.changePeriod(d), step.direction);
      } else if (step.op === "addWorkLine" || step.op === "addAbsence") {
        result = await page.evaluate(([op, s]) => window.__ubw[op](s), [step.op, step]);
      } else {
        result = await page.evaluate((op) => window.__ubw[op](), step.op);
      }
    } catch (error) {
      result = { ok: false, error: String(error && error.message || error) };
    }
    results.push({ op: step.op, ...result });
    if (result && result.ok === false) break;
  }
  const final = await page.evaluate(() => window.__ubw.status());
  return { ok: results.every((r) => r.ok !== false), results, final };
}
`;

fs.writeFileSync(outPath, code);
console.log(JSON.stringify({ ok: true, out: outPath, steps: plan.length }));
