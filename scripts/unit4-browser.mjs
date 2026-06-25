#!/usr/bin/env node
// Thin dispatcher. Per-command logic lives in scripts/lib/*.
// HARD RULE: this dispatcher exposes NO submit/approve/godkjenn verb by design.
// See SKILL.md "Absolute Rules". Do not add such a verb or bypass with raw CDP calls.

const command = process.argv[2] || "snapshot";
const argv = process.argv.slice(3);

const routes = {
  snapshot:              () => import("./lib/inspect.mjs").then((m) => m.snapshot()),
  diagnostics:           () => import("./lib/inspect.mjs").then((m) => m.diagnostics()),
  controls:              () => import("./lib/inspect.mjs").then((m) => m.controls()),
  "editor-values":       () => import("./lib/inspect.mjs").then((m) => m.editorValues()),
  "timesheet-summary":   () => import("./lib/inspect.mjs").then((m) => m.timesheetSummary()),
  "timesheet-lines":     () => import("./lib/inspect.mjs").then((m) => m.timesheetLines()),
  "frame-snapshot":      () => import("./lib/inspect.mjs").then((m) => m.frameSnapshot()),

  "open-timesheets":     () => import("./lib/nav.mjs").then((m) => m.openTimesheets()),
  "open-current-period": () => import("./lib/nav.mjs").then((m) => m.openCurrentPeriod()),

  "click-add-work-task":   () => import("./lib/entry.mjs").then((m) => m.clickAddWorkTask()),
  "click-save-draft":      () => import("./lib/entry.mjs").then((m) => m.clickSaveDraft()),
  "select-worktask":       () => import("./lib/entry.mjs").then((m) => m.selectWorkTaskCli(argv)),
  "add-selected-worktask": () => import("./lib/entry.mjs").then((m) => m.addSelectedWorkTask()),
  "commit-editor":         () => import("./lib/entry.mjs").then((m) => m.commitActiveEditor()),
  "fill-input":            () => import("./lib/entry.mjs").then((m) => m.fillInputCli(argv)),
  "add-line":              () => import("./lib/entry.mjs").then((m) => m.addLineCli(argv)),
  "add-lines":             () => import("./lib/entry.mjs").then((m) => m.addLinesCli(argv)),
  "activate-line":         () => import("./lib/entry.mjs").then((m) => m.activateLineCli(argv)),
  "press-key":             () => import("./lib/entry.mjs").then((m) => m.pressKeyCli(argv)),
};

if (!routes[command]) {
  console.error(`Unknown command: ${command}`);
  console.error(`Available commands: ${Object.keys(routes).join(", ")}`);
  process.exit(2);
}

const result = await routes[command]();
console.log(JSON.stringify(result, null, 2));
