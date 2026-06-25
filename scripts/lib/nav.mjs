import { evaluate, clickPoint } from "./cdp.mjs";

export function openTimesheets() {
  return evaluate(`(() => {
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
  })()`);
}

export async function openCurrentPeriod() {
  const point = await evaluate(`(() => {
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
  })()`);
  if (!point.ok) {
    return point;
  }
  await clickPoint(point);
  return point;
}
