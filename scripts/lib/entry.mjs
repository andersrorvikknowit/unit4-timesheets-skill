import {
  evaluate,
  clickPoint,
  typeText,
  pressKey,
  waitFor,
  clickInputByName,
} from "./cdp.mjs";
import {
  parseOptions,
  inputNameForDay,
  normalizeNumber,
  formatUnit4Decimal,
  lineTotal,
  dayKeyForInputName,
} from "./util.mjs";
import { timesheetLines, getActiveEditorContext } from "./inspect.mjs";

export async function fillInput(name, value) {
  const extResult = await evaluate(`(() => {
    const ext = window.Ext;
    if (!ext || !ext.ComponentQuery) return { ok: false, reason: "ExtJS is not available." };
    const expected = ${JSON.stringify(String(value))};
    const field = ext.ComponentQuery.query("field").find((component) => component.name === ${JSON.stringify(name)});
    if (!field || !field.isVisible || !field.isVisible()) {
      return { ok: false, reason: "Visible ExtJS field not found.", name: ${JSON.stringify(name)} };
    }
    field.focus?.();
    field.setValue?.(expected);
    field.fireEvent?.("change", field, field.getValue?.(), undefined);
    field.fireEvent?.("blur", field);
    const actual = String(field.getValue?.() ?? field.getRawValue?.() ?? "");
    return {
      ok: actual === expected,
      name: ${JSON.stringify(name)},
      expected,
      actual,
      strategy: "extjs"
    };
  })()`);
  if (extResult.ok) return extResult;

  const clicked = await clickInputByName(name);
  if (!clicked.ok) return clicked;
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(`input[name="${name}"]`)});
    if (!element) return { ok: false };
    element.focus();
    element.select();
    return { ok: true };
  })()`);
  await typeText(String(value));
  await pressKey("Tab");
  return waitFor(
    () =>
      evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(`input[name="${name}"]`)});
        if (!element) return { ok: false, reason: "Input disappeared.", name: ${JSON.stringify(name)} };
        const expected = ${JSON.stringify(String(value))};
        const actual = String(element.value || "");
        return {
          ok: actual === expected,
          name: ${JSON.stringify(name)},
          expected,
          actual,
          reason: actual === expected ? undefined : "Input value did not match expected value."
        };
      })()`),
    { label: `input ${name} to contain ${JSON.stringify(String(value))}` },
  );
}

async function getVisibleWorkTaskRows(query) {
  return evaluate(`(() => {
    const query = ${JSON.stringify(query)}.toLowerCase();
    return [...document.querySelectorAll(".abw-pcb-timesheet-worktask-grid-cell")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = (element.innerText || element.textContent || "").trim();
        return {
          ok: text.toLowerCase().includes(query) && rect.width > 0 && rect.height > 0,
          text,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      })
      .filter((row) => row.ok);
  })()`);
}

export async function clickAddWorkTask() {
  const extResult = await evaluate(`(() => {
    const ext = window.Ext;
    const button = ext?.ComponentQuery?.query("button").find((candidate) =>
      candidate.text === "Legg til arb.oppgave" &&
      candidate.isVisible?.() &&
      !candidate.disabled
    );
    if (!button) return { ok: false, reason: "ExtJS Legg til arb.oppgave button not found." };
    button.fireHandler?.();
    return { ok: true, clicked: "Legg til arb.oppgave", targetId: button.id || "", strategy: "extjs" };
  })()`);
  if (extResult.ok) return extResult;

  const point = await evaluate(`(() => {
    const button = document.querySelector("#u4_actionbutton-1387") || document.querySelector(".abw-pcb-timesheet-grid-groupsummary-addworktask") ||
      [...document.querySelectorAll("a,button,span")]
      .find((element) => {
        const text = element.innerText || element.textContent || element.getAttribute("aria-label") || element.title || "";
        return text.includes("Legg til arb.oppgave");
      })
      ?.closest("a,button,.x-btn");
    if (!button) return { ok: false, reason: "Could not find Legg til arb.oppgave." };
    const rect = button.getBoundingClientRect();
    return {
      ok: true,
      clicked: "Legg til arb.oppgave",
      targetId: button.id || "",
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  })()`);
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

export async function selectWorkTask(query) {
  const extSelection = await waitFor(
    () =>
      evaluate(`(() => {
        const ext = window.Ext;
        const query = ${JSON.stringify(query)}.toLowerCase();
        const grids = ext?.ComponentQuery?.query("grid") || [];
        const grid = grids.find((candidate) =>
          candidate.xtype === "abw_pcb_timesheet_standardentry_recentandfavouriteworktasks" ||
          candidate.el?.dom?.querySelector?.(".abw-pcb-timesheet-worktask-grid-cell")
        );
        const store = grid?.getStore?.();
        if (!grid || !store) return { ok: false, reason: "Work-task grid not found." };
        const records = store.getRange();
        const record = records.find((candidate) => {
          const data = candidate.data || {};
          const text = [
            data.projectDescription,
            data.workOrderDescription,
            data.activityDescription,
            data.project,
            data.workOrder,
            data.workTask,
          ].filter(Boolean).join(" ").toLowerCase();
          return text.includes(query);
        });
        if (!record) return { ok: false, reason: "Could not find work task row.", query: ${JSON.stringify(query)} };
        grid.getSelectionModel?.().select(record);
        grid.getView?.().focusRow?.(record);
        return {
          ok: true,
          query: ${JSON.stringify(query)},
          text: [
            record.data.projectDescription,
            record.data.workOrderDescription,
            record.data.activityDescription,
          ].filter(Boolean).join("\\n"),
          strategy: "extjs"
        };
      })()`),
    { label: `work task row matching ${JSON.stringify(query)}` },
  );
  if (extSelection.ok) return extSelection;

  const ready = await waitFor(
    async () => {
      const rows = await getVisibleWorkTaskRows(query);
      return rows.length
        ? { ok: true, rows }
        : { ok: false, reason: "Could not find work task row.", query };
    },
    { label: `work task row matching ${JSON.stringify(query)}` },
  );
  if (!ready.ok) return ready;

  const point = await evaluate(`(() => {
    const query = ${JSON.stringify(query)}.toLowerCase();
    const rows = [...document.querySelectorAll(".abw-pcb-timesheet-worktask-grid-cell")];
    const row = rows.find((element) => {
      const text = (element.innerText || element.textContent || "").toLowerCase();
      const rect = element.getBoundingClientRect();
      return text.includes(query) && rect.width > 0 && rect.height > 0;
    });
    if (!row) return { ok: false, reason: "Could not find work task row.", query: ${JSON.stringify(query)} };
    const target = row.closest(".x-grid-row") || row;
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      query: ${JSON.stringify(query)},
      text: (target.innerText || target.textContent || "").trim().slice(0, 500),
      x: Math.round(rect.left + Math.min(rect.width / 2, 140)),
      y: Math.round(rect.top + rect.height / 2)
    };
  })()`);
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

export async function addSelectedWorkTask() {
  const extResult = await waitFor(
    () =>
      evaluate(`(() => {
        const ext = window.Ext;
        const button = ext?.ComponentQuery?.query("button").find((candidate) =>
          candidate.text === "Legg til i timeliste" &&
          candidate.isVisible?.()
        );
        if (!button) return { ok: false, reason: "Could not find Legg til i timeliste." };
        if (button.disabled) return { ok: false, reason: "Legg til i timeliste is disabled.", targetId: button.id || "" };
        button.fireHandler?.();
        return { ok: true, clicked: "Legg til i timeliste", targetId: button.id || "", strategy: "extjs" };
      })()`),
    { label: "enabled Legg til i timeliste button" },
  );
  if (extResult.ok) return extResult;

  const point = await waitFor(
    () =>
      evaluate(`(() => {
        const button = [...document.querySelectorAll("a,button,span")]
          .find((element) => {
            const text = element.innerText || element.textContent || element.getAttribute("aria-label") || element.title || "";
            return text.includes("Legg til i timeliste");
          })
          ?.closest("a,button,.x-btn");
        if (!button) return { ok: false, reason: "Could not find Legg til i timeliste." };
        const disabled = button.classList.contains("x-disabled") || button.getAttribute("aria-disabled") === "true";
        const rect = button.getBoundingClientRect();
        return {
          ok: !disabled,
          reason: disabled ? "Legg til i timeliste is disabled." : undefined,
          clicked: "Legg til i timeliste",
          targetId: button.id || "",
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      })()`),
    { label: "enabled Legg til i timeliste button" },
  );
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

export function commitActiveEditor() {
  return evaluate(`(() => {
    const ext = window.Ext;
    if (!ext) return { ok: false, reason: "ExtJS is not available." };
    const views = ext.ComponentQuery?.query("gridview") || [];
    for (const view of views) {
      const grid = view.up?.("grid");
      const plugin = grid?.plugins?.find((candidate) =>
        candidate.ptype === "u4_rowediting" &&
        candidate.editing &&
        typeof candidate.completeEdit === "function"
      );
      if (!plugin) continue;
      plugin.completeEdit();
      const record = grid.getSelectionModel?.().getSelection?.()[0];
      return { ok: true, gridId: grid.id || "", record: record?.data || null };
    }
    return { ok: true, reason: "No active row editor.", record: null };
  })()`);
}

async function waitForCommittedLine({ description, dayInputName, hours, minimumMatches = 1 }) {
  const dayKey = dayKeyForInputName(dayInputName);
  const expectedHours = normalizeNumber(hours);

  return waitFor(
    async () => {
      const lines = await timesheetLines();
      const matches = lines.filter((line) =>
        line.description === description &&
        Math.abs(normalizeNumber(line[dayKey]) - expectedHours) < 0.001
      );
      return matches.length >= minimumMatches
        ? { ok: true, line: matches[matches.length - 1], matches, lines }
        : {
            ok: false,
            reason: "Committed line was not visible in grid yet.",
            description,
            day: dayKey,
            hours: expectedHours,
            matches: matches.length,
            minimumMatches,
            lines,
          };
    },
    { label: `committed line ${JSON.stringify(description)}` },
  );
}

export async function addLine({ task, description, day, hours }) {
  if (!task || !description || !day || hours === undefined) {
    return { ok: false, reason: "Missing required line fields: task, description, day, hours." };
  }

  const dayInputName = inputNameForDay(day);
  const precommit = await commitActiveEditor();
  if (!precommit.ok) return precommit;
  const beforeLines = await timesheetLines();
  const dayKey = dayKeyForInputName(dayInputName);
  const beforeMatchingCount = beforeLines.filter((line) =>
    line.description === description &&
    Math.abs(normalizeNumber(line[dayKey]) - normalizeNumber(hours)) < 0.001
  ).length;
  const opened = await clickAddWorkTask();
  if (!opened.ok) return opened;
  const selected = await selectWorkTask(task);
  if (!selected.ok) return selected;
  const added = await addSelectedWorkTask();
  if (!added.ok) return added;
  const editorReady = await waitFor(
    async () => {
      const editor = await getActiveEditorContext();
      const selectedNeedle = selected.text
        .split(/\s+/)
        .filter((part) => part.length >= 4)
        .slice(0, 3);
      const taskMatches = selectedNeedle.some((part) => editor.text?.toLowerCase().includes(part.toLowerCase()));
      return editor.ok && Object.prototype.hasOwnProperty.call(editor.values || {}, "description") && taskMatches
        ? { ok: true, editor }
        : {
            ok: false,
            reason: "New row editor is not ready or does not match the selected task.",
            selected: selected.text,
            editor,
          };
    },
    { label: "new timesheet row editor" },
  );
  if (!editorReady.ok) return editorReady;
  const descriptionResult = await fillInput("description", description);
  if (!descriptionResult.ok) return descriptionResult;
  const hoursResult = await fillInput(dayInputName, formatUnit4Decimal(hours));
  if (!hoursResult.ok) return hoursResult;
  const committedEditor = await commitActiveEditor();
  if (!committedEditor.ok) return committedEditor;

  const committed = await waitForCommittedLine({
    description,
    dayInputName,
    hours,
    minimumMatches: beforeMatchingCount + 1,
  });
  if (!committed.ok) {
    return {
      ok: false,
      reason: "Line was filled but not confirmed in the grid.",
      task,
      description,
      day,
      hours: String(hours),
      selected: selected.text,
      committed,
    };
  }

  const lines = committed.lines;
  const matching = lines.filter((line) => line.description === description);

  return {
    ok: true,
    task,
    description,
    day,
    hours: String(hours),
    selected: selected.text,
    committedEditor,
    matchingLines: matching,
    totalEntered: lines.reduce((sum, line) => sum + lineTotal(line), 0),
  };
}

export async function clickSaveDraft() {
  const point = await evaluate(`(() => {
    const button = [...document.querySelectorAll("a,button,span")]
      .find((element) => element.textContent && element.textContent.trim() === "Lagre som utkast")
      ?.closest("a,button,.x-btn");
    if (!button) return { ok: false, reason: "Could not find Lagre som utkast." };
    const rect = button.getBoundingClientRect();
    return {
      ok: true,
      clicked: "Lagre som utkast",
      targetId: button.id || "",
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  })()`);
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

export async function activateLine(rowId) {
  const point = await evaluate(`(() => {
    const row = document.getElementById(${JSON.stringify(rowId)});
    if (!row) return { ok: false, reason: "Row not found.", rowId: ${JSON.stringify(rowId)} };
    const cell = row.querySelector('[class*="u4_gridcolumn-1356"]') || row.querySelector('[class*="u4_gridcolumn-1351"]') || row;
    const rect = cell.getBoundingClientRect();
    return {
      ok: true,
      rowId: ${JSON.stringify(rowId)},
      x: Math.round(rect.left + Math.min(rect.width / 2, 160)),
      y: Math.round(rect.top + rect.height / 2)
    };
  })()`);
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

export async function selectWorkTaskCli(args) {
  const query = args.join(" ");
  if (!query) return { ok: false, reason: "Missing work task search text." };
  return selectWorkTask(query);
}

export async function fillInputCli(args) {
  const name = args[0];
  const value = args.slice(1).join(" ");
  if (!name) return { ok: false, reason: "Missing input name." };
  return fillInput(name, value);
}

export async function addLineCli(args) {
  const options = parseOptions(args);
  return addLine({
    task: options.task,
    description: options.description,
    day: options.day,
    hours: options.hours,
  });
}

export async function addLinesCli(args) {
  const options = parseOptions(args);
  const source = options.json || options._?.[0];
  if (!source) {
    return { ok: false, reason: "Missing JSON array. Use --json '[...]'." };
  }

  const lines = JSON.parse(source);
  if (!Array.isArray(lines)) {
    return { ok: false, reason: "JSON value must be an array of line objects." };
  }

  const added = [];
  for (const line of lines) {
    const result = await addLine(line);
    added.push(result);
    if (!result.ok) {
      return { ok: false, failed: result, added };
    }
  }

  const tlines = await timesheetLines();
  const totalEntered = tlines.reduce((sum, line) => sum + lineTotal(line), 0);
  const expectedTotal = options["expect-total"] === undefined ? undefined : Number.parseFloat(String(options["expect-total"]).replace(",", "."));

  return {
    ok: expectedTotal === undefined || Math.abs(totalEntered - expectedTotal) < 0.001,
    added,
    expectedTotal,
    totalEntered,
    lines: tlines,
    warning: expectedTotal !== undefined && Math.abs(totalEntered - expectedTotal) >= 0.001
      ? `Total entered ${totalEntered} does not match expected ${expectedTotal}.`
      : undefined,
  };
}

export async function activateLineCli(args) {
  const rowId = args[0];
  if (!rowId) return { ok: false, reason: "Missing row id." };
  return activateLine(rowId);
}

export async function pressKeyCli(args) {
  const key = args[0];
  if (!key) return { ok: false, reason: "Missing key." };
  return pressKey(key);
}
