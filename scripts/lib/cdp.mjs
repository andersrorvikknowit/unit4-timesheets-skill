import http from "node:http";

const port = process.env.UNIT4_CHROME_DEBUG_PORT || "9224";

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

export async function withCdp(action) {
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

export async function evaluate(expression) {
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

export async function clickPoint(point) {
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

export async function typeText(text) {
  return withCdp(async (cdp) => {
    await cdp.send("Input.insertText", { text });
    return { ok: true, text };
  });
}

export async function pressKey(key) {
  return withCdp(async (cdp) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key });
    return { ok: true, key };
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(check, { timeoutMs = 8000, intervalMs = 250, label = "condition" } = {}) {
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

export async function clickSelectorCenter(selector) {
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

export async function clickInputByName(name) {
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
