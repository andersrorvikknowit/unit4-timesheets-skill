// Browser-side helpers for the UBW (Unit4 ERP) timesheet page.
// Self-contained: inject into the page (CDP Runtime.evaluate, Playwright page.evaluate/addScriptTag)
// and call window.__ubw.<fn>(). Every helper works through ExtJS component state, never screen
// coordinates, and returns plain JSON so any automation driver can read the result.
// Re-injecting is safe and intended: it replaces any older copy left in the page.
(() => {
  const DESCRIPTION_MAX = 240; // server column limit is 255; keep a margin for multibyte characters
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(check, { timeoutMs = 15000, intervalMs = 200, label = "condition" } = {}) {
    const started = Date.now();
    let last;
    while (Date.now() - started < timeoutMs) {
      try {
        last = check();
        if (last) return last;
      } catch (error) {
        last = { error: String(error) };
      }
      await sleep(intervalMs);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  const q = (selector, root) => (window.Ext ? Ext.ComponentQuery.query(selector, root) : []);
  const visibleButton = (text, root) => q("button", root).find((b) => b.text === text && b.isVisible());

  function timesheetGrid() {
    return q("gridpanel").find(
      (g) => g.id.startsWith("abw_pcb_timesheet_standardentry_gridview") && g.isVisible(),
    );
  }

  function workTaskPicker() {
    return q("abw_pcb_timesheet_standardentry_recentandfavouriteworktasks").find((g) => g.isVisible());
  }

  function absencePicker() {
    const overlay = q("abw_pcb_timesheet_standardentry_addabsenceoverlay").find((o) => o.isVisible());
    if (!overlay) return null;
    const grid = q("u4_grid", overlay).find((g) => g.getStore().getCount() > 0);
    return grid ? { overlay, grid } : null;
  }

  function dayColumns() {
    // Header texts look like "Man<br>19/10" (sometimes HTML-escaped); the n-th dated column maps
    // to regValue<n>. Periods can start on any weekday and have 6-8 columns.
    const grid = timesheetGrid();
    if (!grid) return [];
    return grid.headerCt
      .getGridColumns()
      .map((c) => (c.text || "").replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((t) => /\d{1,2}\/\d{1,2}$/.test(t))
      .map((label, i) => ({ field: `regValue${i + 1}`, label }));
  }

  function readLines() {
    const grid = timesheetGrid();
    if (!grid) return { ok: false, reason: "Timesheet grid not visible." };
    const columns = dayColumns();
    const lines = grid.getStore().getRange().map((r) => {
      const d = r.data;
      return {
        project: d.project,
        projectDescr: d.projectDescr,
        workOrder: d.workOrder,
        workOrderDescr: d.workOrderDescr,
        activity: d.activity || "",
        activityDescr: d.activityDescr || "",
        timeCode: d.timeCode,
        timeCodeDescr: d.timeCodeDescr,
        description: d.description || "",
        hours: columns.map((c) => Number(d[c.field] || 0)),
        sum: Number(d.sum || 0),
        status: d.status,
        unsaved: !!(r.dirty || r.phantom),
      };
    });
    const dayTotals = columns.map((_, i) => lines.reduce((s, l) => s + l.hours[i], 0));
    return { ok: true, columns: columns.map((c) => c.label), lines, dayTotals, total: dayTotals.reduce((a, b) => a + b, 0) };
  }

  function status() {
    const header = [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && /^\d+\.\d\d \/ \d+\.\d\d timer$/.test((e.textContent || "").trim()))
      .map((e) => e.textContent.trim())[0] || null;
    const plan = [...document.querySelectorAll("*")]
      .find((e) => e.children.length === 0 && (e.textContent || "").trim() === "Arbeidsplan");
    const lines = timesheetGrid() ? readLines() : null;
    return {
      ok: true,
      title: document.title,
      period: (document.title.match(/Timeliste (\d{6})/) || [])[1] || null,
      header,
      workPlan: plan ? plan.parentElement.innerText.split("\n").slice(1).map(Number) : null,
      columns: lines ? lines.columns : [],
      lineCount: lines ? lines.lines.length : 0,
      unsavedCount: lines ? lines.lines.filter((l) => l.unsaved).length : 0,
      statuses: lines ? [...new Set(lines.lines.map((l) => l.status))] : [],
      dayTotals: lines ? lines.dayTotals : [],
    };
  }

  function commitEditor() {
    for (const view of q("gridview")) {
      const grid = view.up && view.up("grid");
      const plugin = grid && grid.plugins && grid.plugins.find((p) => p.ptype === "u4_rowediting" && p.editing);
      if (plugin) {
        plugin.completeEdit();
        return true;
      }
    }
    return false;
  }

  async function openWorkTaskPicker() {
    commitEditor();
    await sleep(300);
    if (!workTaskPicker()) {
      const add = q("button").find((b) => b.text === "Legg til arb.oppgave" && b.isVisible() && !b.disabled);
      if (!add) throw new Error("Legg til arb.oppgave button not available.");
      add.fireHandler();
    }
    return waitFor(() => {
      const g = workTaskPicker();
      return g && g.getStore().getCount() > 0 && g;
    }, { label: "work-task picker" });
  }

  async function listTasks() {
    const picker = await openWorkTaskPicker();
    return {
      ok: true,
      tasks: picker.getStore().getRange().map((r) => ({
        project: r.data.project,
        projectDescription: r.data.projectDescription,
        workOrder: r.data.workOrder,
        workOrderDescription: r.data.workOrderDescription,
        activity: r.data.activity || "",
        activityDescription: r.data.activityDescription || "",
        favourite: !!r.data.favouriteFlag,
      })),
    };
  }

  function setField(name, value) {
    const field = q("field").find((f) => f.name === name && f.isVisible());
    if (!field) throw new Error(`Editor field ${name} not visible.`);
    field.focus();
    field.setValue(value);
    field.fireEvent("change", field, field.getValue());
    field.fireEvent("blur", field);
    return String(field.getValue());
  }

  function matchesLine(line, spec, field) {
    return (
      (!spec.workOrder || line.workOrder === spec.workOrder) &&
      (spec.activity === undefined || line.activity === spec.activity) &&
      (!spec.timeCode || line.timeCode === spec.timeCode) &&
      line.description === spec.description &&
      Math.abs(line.hours[Number(field.replace("regValue", "")) - 1] - Number(spec.hours)) < 0.001
    );
  }

  function validateSpec(spec) {
    const day = Number(spec.day);
    const columns = dayColumns();
    if (!Number.isInteger(day) || day < 1 || day > columns.length) {
      throw new Error(`day must be 1..${columns.length} (columns: ${columns.map((c) => c.label).join(", ")})`);
    }
    if (!(Number(spec.hours) > 0)) throw new Error("hours must be > 0");
    if ((spec.description || "").length > DESCRIPTION_MAX) {
      throw new Error(`description is ${spec.description.length} chars; max ${DESCRIPTION_MAX}`);
    }
    return `regValue${day}`;
  }

  // spec: { workOrder, activity ("" when the task has no activity), day (1-based column), hours, description }
  async function addWorkLine(spec) {
    const field = validateSpec(spec);
    const before = readLines().lines.filter((l) => matchesLine(l, spec, field)).length;
    const picker = await openWorkTaskPicker();
    const record = picker.getStore().getRange().find(
      (r) => r.data.workOrder === spec.workOrder && (r.data.activity || "") === (spec.activity || ""),
    );
    if (!record) {
      return { ok: false, reason: "Work task not in favourites/recent list. Search in the picker (type keystrokes) or ask the user.", spec };
    }
    picker.getSelectionModel().select(record);
    const addButton = await waitFor(() => {
      const b = visibleButton("Legg til i timeliste");
      return b && !b.disabled && b;
    }, { label: "enabled Legg til i timeliste" });
    addButton.fireHandler();
    await waitFor(() => q("field").find((f) => f.name === "description" && f.isVisible()), { label: "row editor" });
    await sleep(600);
    setField("description", spec.description);
    setField(field, String(spec.hours));
    await sleep(300);
    commitEditor();
    const after = await waitFor(() => {
      const n = readLines().lines.filter((l) => matchesLine(l, spec, field)).length;
      return n > before && n;
    }, { label: "committed line", timeoutMs: 8000 }).catch(() => 0);
    const task = [record.data.projectDescription, record.data.workOrderDescription, record.data.activityDescription]
      .filter(Boolean)
      .join(" / ");
    return after ? { ok: true, task, spec } : { ok: false, reason: "Line not confirmed in grid.", task, spec };
  }

  // spec: { code (absence value such as the code shown in listAbsenceCodes), day, hours, description? }
  async function addAbsence(spec) {
    const field = validateSpec({ ...spec, description: spec.description || "" });
    commitEditor();
    await sleep(300);
    if (!absencePicker()) {
      const add = q("button").find((b) => b.text === "Legg til fravær" && b.isVisible() && !b.disabled);
      if (!add) throw new Error("Legg til fravær button not available.");
      add.fireHandler();
    }
    const { overlay, grid } = await waitFor(absencePicker, { label: "absence picker" });
    const record = grid.getStore().getRange().find((r) => r.data.value === spec.code);
    if (!record) return { ok: false, reason: `Absence code ${spec.code} not found.` };
    grid.getSelectionModel().select(record);
    const addButton = await waitFor(() => {
      const b = visibleButton("Legg til i timeliste", overlay);
      return b && !b.disabled && b;
    }, { label: "enabled Legg til i timeliste (absence)" });
    addButton.fireHandler();
    await waitFor(() => q("field").find((f) => f.name === field && f.isVisible()), { label: "absence row editor" });
    await sleep(600);
    if (spec.description) setField("description", spec.description);
    setField(field, String(spec.hours));
    await sleep(300);
    commitEditor();
    await sleep(1000);
    const line = readLines().lines.find(
      (l) => l.timeCode === spec.code && Math.abs(l.hours[Number(field.slice(8)) - 1] - Number(spec.hours)) < 0.001,
    );
    return line ? { ok: true, absence: record.data.description, spec } : { ok: false, reason: "Absence line not confirmed.", spec };
  }

  async function listAbsenceCodes() {
    commitEditor();
    if (!absencePicker()) {
      q("button").find((b) => b.text === "Legg til fravær" && b.isVisible() && !b.disabled).fireHandler();
    }
    const { grid } = await waitFor(absencePicker, { label: "absence picker" });
    const codes = grid.getStore().getRange().map((r) => ({ code: r.data.value, description: r.data.description }));
    closeOverlays();
    return { ok: true, codes };
  }

  function closeOverlays() {
    q("window").filter((w) => w.isVisible() && w.closable).forEach((w) => w.close());
    for (const o of q("abw_pcb_timesheet_standardentry_addabsenceoverlay").filter((o) => o.isVisible())) o.hide();
    const picker = workTaskPicker();
    const overlay = picker && picker.up("[floating=true]");
    if (overlay) overlay.hide();
  }

  // Saves through the page's own "Lagre som utkast" handler and reports the server response.
  async function saveDraft() {
    commitEditor();
    await sleep(300);
    const button = visibleButton("Lagre som utkast");
    if (!button) return { ok: false, reason: "Lagre som utkast not visible." };
    const result = new Promise((resolve) => {
      const done = (conn, response, options, ok) => {
        const url = (options && options.url) || "";
        if (!/\/api\/pcb\/timesheet\/timesheets\//.test(url) || (options.method || "").toUpperCase() !== "POST") return;
        Ext.Ajax.un("requestcomplete", onOk);
        Ext.Ajax.un("requestexception", onErr);
        let message = "";
        try { message = JSON.parse(response.responseText || "{}").message || ""; } catch (e) { /* not JSON */ }
        resolve({ httpStatus: response.status, ok: ok && response.status < 400, message });
      };
      const onOk = (c, r, o) => done(c, r, o, true);
      const onErr = (c, r, o) => done(c, r, o, false);
      Ext.Ajax.on("requestcomplete", onOk);
      Ext.Ajax.on("requestexception", onErr);
      setTimeout(() => resolve({ ok: false, reason: "No save response within 30s." }), 30000);
    });
    // Overlays can block real clicks on the action bar; the ExtJS handler is the reliable path.
    button.fireHandler();
    const response = await result;
    await sleep(2000);
    return { ...response, status: status() };
  }

  async function changePeriod(direction) {
    const label = direction < 0 ? "Forrige periode" : "Neste periode";
    const before = status().period;
    const el = document.querySelector(`[aria-label="${label}"]`) ||
      [...document.querySelectorAll("a,button")].find((e) => e.getAttribute("data-qtip") === label);
    if (!el) return { ok: false, reason: `${label} button not found.` };
    el.click();
    await waitFor(() => status().period && status().period !== before, { label: "period change", timeoutMs: 20000 });
    await sleep(1500);
    return status();
  }

  window.__ubw = {
    version: 2,
    DESCRIPTION_MAX,
    status,
    readLines,
    dayColumns: () => dayColumns().map((c) => c.label),
    listTasks,
    listAbsenceCodes,
    addWorkLine,
    addAbsence,
    commitEditor,
    closeOverlays,
    saveDraft,
    changePeriod,
  };
})();
