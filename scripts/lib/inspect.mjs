import { evaluate } from "./cdp.mjs";

export function snapshot() {
  return evaluate(`(() => {
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
  })()`);
}

export function diagnostics() {
  return evaluate(`(() => {
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
  })()`);
}

export function controls() {
  return evaluate(`(() => {
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
  })()`);
}

export function editorValues() {
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

export function getActiveEditorContext() {
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

export function timesheetSummary() {
  return evaluate(`(() => {
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
  })()`);
}

export async function timesheetLines() {
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

export function frameSnapshot() {
  return evaluate(`(() => {
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
  })()`);
}
