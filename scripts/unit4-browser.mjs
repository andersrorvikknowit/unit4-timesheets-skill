#!/usr/bin/env node
import http from "node:http";

const port = process.env.UNIT4_CHROME_DEBUG_PORT || "9224";
const command = process.argv[2] || "snapshot";

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }

      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    };
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function withCdp(action) {
  const tabs = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page = tabs.find((tab) => tab.type === "page");

  if (!page) {
    throw new Error(`No Chrome page target found on port ${port}.`);
  }

  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");

  try {
    return await action(cdp);
  } finally {
    cdp.close();
  }
}

async function evaluate(expression) {
  return withCdp(async (cdp) => {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  }

  return result.result.value;
  });
}

async function clickPoint(point) {
  return withCdp(async (cdp) => {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    return point;
  });
}

async function typeText(text) {
  return withCdp(async (cdp) => {
    await cdp.send("Input.insertText", { text });
    return { ok: true, text };
  });
}

async function pressKey(key) {
  return withCdp(async (cdp) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key });
    return { ok: true, key };
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, { timeoutMs = 8000, intervalMs = 250, label = "condition" } = {}) {
  const started = Date.now();
  let lastResult;

  while (Date.now() - started <= timeoutMs) {
    lastResult = await check();
    if (lastResult && lastResult.ok) {
      return lastResult;
    }
    await sleep(intervalMs);
  }

  return {
    ok: false,
    reason: `Timed out waiting for ${label}.`,
    lastResult,
  };
}

async function clickSelectorCenter(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: "Selector not found", selector: ${JSON.stringify(selector)} };
    const rect = element.getBoundingClientRect();
    return {
      ok: true,
      selector: ${JSON.stringify(selector)},
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  })()`);
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

async function clickInputByName(name) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(`input[name="${name}"]`)});
    if (!element) return { ok: false, reason: "Input not found", name: ${JSON.stringify(name)} };
    const rect = element.getBoundingClientRect();
    return {
      ok: true,
      name: ${JSON.stringify(name)},
      id: element.id || "",
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  })()`);
  if (!point.ok) return point;
  await clickPoint(point);
  return point;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      if (!options._) options._ = [];
      options._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function inputNameForDay(day) {
  const normalized = day.toLowerCase();
  const map = {
    mon: "regValue1",
    monday: "regValue1",
    man: "regValue1",
    "25/05": "regValue1",
    tue: "regValue2",
    tuesday: "regValue2",
    tir: "regValue2",
    "26/05": "regValue2",
    wed: "regValue3",
    wednesday: "regValue3",
    ons: "regValue3",
    "27/05": "regValue3",
    thu: "regValue4",
    thursday: "regValue4",
    tor: "regValue4",
    "28/05": "regValue4",
    fri: "regValue5",
    friday: "regValue5",
    fre: "regValue5",
    "29/05": "regValue5",
    sat: "regValue6",
    saturday: "regValue6",
    lor: "regValue6",
    lør: "regValue6",
    "30/05": "regValue6",
    sun: "regValue7",
    sunday: "regValue7",
    son: "regValue7",
    søn: "regValue7",
    "31/05": "regValue7",
  };

  if (!map[normalized]) {
    throw new Error(`Unknown day: ${day}`);
  }

  return map[normalized];
}

async function fillInput(name, value) {
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

async function clickAddWorkTask() {
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

async function selectWorkTask(query) {
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

async function addSelectedWorkTask() {
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

async function getEditorValues() {
  return evaluate(`(() => {
    const names = ["description", "regValue1", "regValue2", "regValue3", "regValue4", "regValue5", "regValue6", "regValue7"];
    const values = {};
    for (const name of names) {
      const element = document.querySelector('input[name="' + name + '"]');
      if (element) values[name] = element.value || "";
    }
    return values;
  })()`);
}

async function getActiveEditorContext() {
  return evaluate(`(() => {
    const editor = document.querySelector(".u4-grid-row-editor:not(.x-hide-offsets), .x-grid-row-editor:not(.x-hide-offsets)");
    if (!editor) return { ok: false, reason: "No visible row editor." };
    const rect = editor.getBoundingClientRect();
    return {
      ok: rect.width > 0 && rect.height > 0,
      text: (editor.innerText || editor.textContent || "").trim(),
      values: Object.fromEntries([...editor.querySelectorAll("input[name]")].map((input) => [input.name, input.value || ""])),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  })()`);
}

async function commitActiveEditor() {
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

async function getTimesheetLines() {
  const extLines = await evaluate(`(() => {
    const ext = window.Ext;
    const view = ext?.ComponentQuery?.query("gridview").find((candidate) =>
      candidate.el?.dom?.querySelector?.("tr.abw-pcb-timesheet-grid-row")
    );
    const store = view?.getStore?.();
    if (!store) return null;
    return store.getRange()
      .filter((record) => record?.data && record.data.tseGlDetailId !== undefined)
      .map((record, index) => {
        const data = record.data;
        return {
          index,
          id: String(data.tseGlDetailId ?? ""),
          task: data.workOrderDescr || data.projectDescr || "",
          project: data.projectDescr || "",
          description: data.description || "",
          timeCode: data.timeCode || "",
          unit: data.regUnitDescr || "",
          mon: data.regValue1 === 0 ? "" : String(data.regValue1),
          tue: data.regValue2 === 0 ? "" : String(data.regValue2),
          wed: data.regValue3 === 0 ? "" : String(data.regValue3),
          thu: data.regValue4 === 0 ? "" : String(data.regValue4),
          fri: data.regValue5 === 0 ? "" : String(data.regValue5),
          sat: data.regValue6 === 0 ? "" : String(data.regValue6),
          sun: data.regValue7 === 0 ? "" : String(data.regValue7),
          total: Number(data.sum || 0).toFixed(2)
        };
      });
  })()`);
  if (Array.isArray(extLines)) return extLines;

  return evaluate(`(() => {
    const rows = [...document.querySelectorAll("tr.abw-pcb-timesheet-grid-row")];
    return rows
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((row, index) => {
        const cell = (suffix) => {
          const element = row.querySelector('[class*="' + suffix + '"]');
          return element ? (element.innerText || element.textContent || "").trim() : "";
        };
        return {
          index,
          id: row.id || "",
          task: cell("u4_gridcolumn-1351"),
          description: cell("u4_gridcolumn-1356"),
          timeCode: cell("u4_gridcolumn-1357"),
          unit: cell("u4_gridcolumn-1358"),
          mon: cell("u4_numbercolumn-1359"),
          tue: cell("u4_numbercolumn-1360"),
          wed: cell("u4_numbercolumn-1361"),
          thu: cell("u4_numbercolumn-1362"),
          fri: cell("u4_numbercolumn-1363"),
          sat: cell("u4_numbercolumn-1364"),
          sun: cell("u4_numbercolumn-1365"),
          total: cell("u4_numbercolumn-1375")
        };
      });
  })()`);
}

function lineTotal(line) {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    .map((day) => Number.parseFloat(String(line[day] || "0").replace(",", ".")) || 0)
    .reduce((sum, value) => sum + value, 0);
}

function normalizeNumber(value) {
  const parsed = Number.parseFloat(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKeyForInputName(inputName) {
  const map = {
    regValue1: "mon",
    regValue2: "tue",
    regValue3: "wed",
    regValue4: "thu",
    regValue5: "fri",
    regValue6: "sat",
    regValue7: "sun",
  };
  return map[inputName];
}

async function waitForCommittedLine({ description, dayInputName, hours, minimumMatches = 1 }) {
  const dayKey = dayKeyForInputName(dayInputName);
  const expectedHours = normalizeNumber(hours);

  return waitFor(
    async () => {
      const lines = await getTimesheetLines();
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

async function addLine({ task, description, day, hours }) {
  if (!task || !description || !day || hours === undefined) {
    return { ok: false, reason: "Missing required line fields: task, description, day, hours." };
  }

  const dayInputName = inputNameForDay(day);
  const precommit = await commitActiveEditor();
  if (!precommit.ok) return precommit;
  const beforeLines = await getTimesheetLines();
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
  const hoursResult = await fillInput(dayInputName, String(hours));
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

const commands = {
  snapshot: () =>
    evaluate(`(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      return {
        title: document.title,
        url: location.href,
        frames: [...document.querySelectorAll("iframe,frame")].map((frame, index) => ({
          index,
          src: frame.src,
          name: frame.name,
          id: frame.id,
          title: frame.title
        })),
        text: (document.body && document.body.innerText || "").slice(0, 12000),
        clickables: [...document.querySelectorAll("a,button,input,[role=button],span")]
          .filter(visible)
          .map((element, index) => ({
            index,
            tag: element.tagName,
            text: (element.innerText || element.value || element.getAttribute("aria-label") || element.title || "").trim().slice(0, 140),
            id: element.id || "",
            className: element.className || ""
          }))
          .filter((item) => item.text)
          .slice(0, 250)
      };
    })()`),

  diagnostics: () =>
    evaluate(`(() => {
      const rectOf = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          selector,
          id: element.id || "",
          className: element.className || "",
          text: (element.innerText || element.textContent || "").trim().slice(0, 300),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      };
      const exactTextCount = (text) =>
        [...document.querySelectorAll("a,button,span,div")]
          .filter((element) => element.textContent && element.textContent.trim() === text)
          .length;
      return {
        title: document.title,
        url: location.href,
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          devicePixelRatio: window.devicePixelRatio,
          visualViewport: window.visualViewport ? {
            width: Math.round(window.visualViewport.width),
            height: Math.round(window.visualViewport.height),
            scale: window.visualViewport.scale,
            offsetLeft: window.visualViewport.offsetLeft,
            offsetTop: window.visualViewport.offsetTop
          } : null
        },
        document: {
          readyState: document.readyState,
          bodyClass: document.body ? document.body.className : "",
          activeElement: document.activeElement ? {
            tag: document.activeElement.tagName,
            id: document.activeElement.id || "",
            className: document.activeElement.className || "",
            text: (document.activeElement.innerText || document.activeElement.value || "").trim().slice(0, 120)
          } : null,
          scrollX,
          scrollY,
          bodyScrollWidth: document.body ? document.body.scrollWidth : null,
          bodyScrollHeight: document.body ? document.body.scrollHeight : null
        },
        counts: {
          frames: document.querySelectorAll("iframe,frame").length,
          extComponents: document.querySelectorAll("[id^='u4_'], [id^='ext-'], [id^='tab-']").length,
          currentPeriodButtons: exactTextCount("Åpne nåværende periode"),
          outstandingHeaders: exactTextCount("Utestående perioder"),
          timesheetTabs: [...document.querySelectorAll(".x-tab")].filter((element) =>
            (element.innerText || element.textContent || "").includes("Timelister")
          ).length
        },
        keyRects: [
          rectOf("body"),
          rectOf("#u4_pagebutton-1185"),
          rectOf("#u4_pagebutton-1161"),
          rectOf(".abw-pcb-timesheet-launchpage-todaysection-period-id"),
          rectOf(".abw-pcb-timesheet-launchingpage-pendingperiodssection-emptylist-label")
        ]
      };
    })()`),

  controls: () =>
    evaluate(`(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      return [...document.querySelectorAll("input,textarea,select,a,button,[role=button],.x-grid-cell,.x-grid-row,.x-form-field")]
        .filter(visible)
        .map((element, index) => {
          const rect = element.getBoundingClientRect();
          return {
            index,
            tag: element.tagName,
            type: element.type || "",
            id: element.id || "",
            name: element.name || "",
            value: element.value || "",
            text: (element.innerText || element.getAttribute("aria-label") || element.title || element.placeholder || "").trim().slice(0, 180),
            className: element.className || "",
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
          };
        })
        .slice(0, 500);
    })()`),

  "editor-values": () =>
    getEditorValues(),

  "commit-editor": () =>
    commitActiveEditor(),

  "timesheet-summary": () =>
    evaluate(`(() => {
      const rows = [...document.querySelectorAll("#abw_pcb_timesheet_standardentry_gridview-1316-body tr, .x-grid-row")];
      return rows
        .map((row, index) => {
          const rect = row.getBoundingClientRect();
          const cells = [...row.querySelectorAll("td")].map((cell) => ({
            text: (cell.innerText || cell.textContent || "").trim(),
            className: cell.className || ""
          }));
          return {
            index,
            id: row.id || "",
            className: row.className || "",
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            text: (row.innerText || row.textContent || "").trim(),
            cells
          };
        })
        .filter((row) => row.rect.width > 0 && row.rect.height > 0)
        .slice(0, 120);
    })()`),

  "timesheet-lines": () =>
    getTimesheetLines(),

  "click-add-work-task": () =>
    clickAddWorkTask(),

  "click-save-draft": () =>
    evaluate(`(() => {
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
    })()`).then(async (point) => {
      if (!point.ok) return point;
      await clickPoint(point);
      return point;
    }),

  "select-worktask": async () => {
    const query = process.argv.slice(3).join(" ");
    if (!query) return { ok: false, reason: "Missing work task search text." };
    return selectWorkTask(query);
  },

  "add-selected-worktask": () => addSelectedWorkTask(),

  "fill-input": async () => {
    const name = process.argv[3];
    const value = process.argv.slice(4).join(" ");
    if (!name) return { ok: false, reason: "Missing input name." };
    return fillInput(name, value);
  },

  "add-line": async () => {
    const options = parseOptions(process.argv.slice(3));
    return addLine({
      task: options.task,
      description: options.description,
      day: options.day,
      hours: options.hours,
    });
  },

  "add-lines": async () => {
    const options = parseOptions(process.argv.slice(3));
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

    const timesheetLines = await getTimesheetLines();
    const totalEntered = timesheetLines.reduce((sum, line) => sum + lineTotal(line), 0);
    const expectedTotal = options["expect-total"] === undefined ? undefined : Number.parseFloat(String(options["expect-total"]).replace(",", "."));

    return {
      ok: expectedTotal === undefined || Math.abs(totalEntered - expectedTotal) < 0.001,
      added,
      expectedTotal,
      totalEntered,
      lines: timesheetLines,
      warning: expectedTotal !== undefined && Math.abs(totalEntered - expectedTotal) >= 0.001
        ? `Total entered ${totalEntered} does not match expected ${expectedTotal}.`
        : undefined,
    };
  },

  "activate-line": async () => {
    const rowId = process.argv[3];
    if (!rowId) return { ok: false, reason: "Missing row id." };
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
  },

  "press-key": async () => {
    const key = process.argv[3];
    if (!key) return { ok: false, reason: "Missing key." };
    return pressKey(key);
  },

  "open-timesheets": () =>
    evaluate(`(() => {
      const click = (element) => {
        ["mousedown", "mouseup", "click"].forEach((type) =>
          element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
        );
      };
      const folders = [...document.querySelectorAll(".u4-menu-launch-folder")];
      const startsider = folders.find((folder) =>
        [...folder.querySelectorAll(".u4-menu-folder-header")].some((header) => header.textContent.trim() === "Startsider")
      );
      if (!startsider) {
        return { ok: false, reason: "Could not find Startsider folder." };
      }
      const itemText = [...startsider.querySelectorAll(".u4-menu-item-text")]
        .find((item) => item.textContent.trim() === "Timelister");
      if (!itemText) {
        return { ok: false, reason: "Could not find Timelister under Startsider." };
      }
      const item = itemText.closest(".u4-menu-folder-item-outer") || itemText;
      click(item);
      return { ok: true, clicked: itemText.textContent.trim(), section: "Startsider" };
    })()`),

  "frame-snapshot": () =>
    evaluate(`(() => {
      const frame = document.querySelector("iframe");
      const doc = frame && frame.contentDocument;
      return {
        frameUrl: frame && frame.src,
        readyState: doc && doc.readyState,
        title: doc && doc.title,
        text: (doc && doc.body && doc.body.innerText || "").slice(0, 16000),
        fields: doc ? [...doc.querySelectorAll("input,textarea,select,button,a,[role=button]")]
          .map((element, index) => ({
            index,
            tag: element.tagName,
            type: element.type || "",
            id: element.id || "",
            name: element.name || "",
            value: element.value || "",
            text: (element.innerText || element.getAttribute("aria-label") || element.title || element.placeholder || "").trim().slice(0, 140),
            className: element.className || ""
          }))
          .slice(0, 300) : []
      };
    })()`),

  "open-current-period": () =>
    evaluate(`(() => {
      const section = [...document.querySelectorAll(".abw-pcb-timesheet-launchingpage-todaysectioncontainer")]
        .find((element) =>
          element.textContent.includes("Din nåværende periode") &&
          element.textContent.includes("Periode") &&
          element.textContent.includes("Åpne nåværende periode")
        );
      if (!section) {
        return { ok: false, reason: "Could not find current-period section." };
      }
      const candidates = [...section.querySelectorAll("a,button,span,div")]
        .filter((element) => element.textContent && element.textContent.trim() === "Åpne nåværende periode");
      const targetText = candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.closest("a,button,.x-btn");
      });
      if (!targetText) {
        return { ok: false, reason: "Could not find Åpne nåværende periode inside current-period section." };
      }
      const target = targetText.closest("a,button,[role=button],.x-btn,.u4-overview-list-item") || targetText;
      const rect = target.getBoundingClientRect();
      return {
        ok: true,
        clicked: targetText.textContent.trim(),
        section: "Din nåværende periode",
        targetId: target.id || "",
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      };
    })()`).then(async (point) => {
      if (!point.ok) {
        return point;
      }
      await clickPoint(point);
      return point;
    }),
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  console.error(`Available commands: ${Object.keys(commands).join(", ")}`);
  process.exit(2);
}

const result = await commands[command]();
console.log(JSON.stringify(result, null, 2));
