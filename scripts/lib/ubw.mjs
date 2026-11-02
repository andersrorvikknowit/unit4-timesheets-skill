// CLI wrappers around scripts/ubw-page.js (window.__ubw), the page helpers shared with the
// Playwright MCP runner (scripts/playwright-run.mjs). Like the rest of the CLI, this exposes
// no submit/approve verb, and ubw-page.js contains no submit function.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./cdp.mjs";
import { parseOptions } from "./util.mjs";

const helperSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ubw-page.js"),
  "utf8",
);

const ALLOWED = new Set([
  "status", "readLines", "listTasks", "listAbsenceCodes",
  "addWorkLine", "addAbsence", "saveDraft", "changePeriod",
]);

function call(fn, arg) {
  if (!ALLOWED.has(fn)) return Promise.resolve({ ok: false, reason: `Not an allowed helper: ${fn}` });
  return evaluate(`${helperSource}
    ;(async () => {
      try {
        return await window.__ubw[${JSON.stringify(fn)}](${arg === undefined ? "" : JSON.stringify(arg)});
      } catch (error) {
        return { ok: false, error: String(error && error.message || error) };
      }
    })()`);
}

function jsonArg(argv) {
  const options = parseOptions(argv);
  const raw = options.json || options._?.[0];
  if (!raw) throw new Error("Missing --json '{...}'.");
  return JSON.parse(raw);
}

export const status = () => call("status");
export const readLines = () => call("readLines");
export const listTasks = () => call("listTasks");
export const listAbsenceCodes = () => call("listAbsenceCodes");
export const saveDraft = () => call("saveDraft");
export const addWorkLineCli = (argv) => call("addWorkLine", jsonArg(argv));
export const addAbsenceCli = (argv) => call("addAbsence", jsonArg(argv));
export const changePeriodCli = (argv) => {
  const direction = Number(argv[0]);
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "Use change-period -1 or 1." };
  return call("changePeriod", direction);
};

// Same plan format as playwright-run.mjs; stops at the first failed step.
export async function runPlanCli(argv) {
  const file = argv[0];
  if (!file) return { ok: false, reason: "Missing plan file." };
  const plan = JSON.parse(fs.readFileSync(file, "utf8"));
  const results = [];
  for (const step of plan) {
    let result;
    if (step.op === "expectPeriod") {
      const s = await call("status");
      result = { ok: s.period === step.period, expected: step.period, actual: s.period };
    } else if (step.op === "expectDayTotals") {
      const s = await call("status");
      result = {
        ok: step.dayTotals.every((h, i) => Math.abs((s.dayTotals[i] || 0) - h) < 0.001),
        expected: step.dayTotals,
        actual: s.dayTotals,
      };
    } else if (step.op === "changePeriod") {
      result = await call("changePeriod", step.direction);
    } else if (step.op === "addWorkLine" || step.op === "addAbsence") {
      result = await call(step.op, step);
    } else {
      result = await call(step.op);
    }
    results.push({ op: step.op, ...result });
    if (!result || result.ok === false) break;
  }
  return { ok: results.every((r) => r.ok !== false), results, final: await call("status") };
}
