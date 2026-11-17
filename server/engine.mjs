import { chromium } from "playwright";
import {
  VIEWPORTS,
  localUrl,
  validateAction,
  validateTargets,
} from "./validation.mjs";

// This function runs inside the inspected app, without access to the controller.
function discoverControls(point) {
  const elements = point
    ? [
        document
          .elementFromPoint(point.x, point.y)
          ?.closest("button,a,input,textarea,select,[role]"),
      ].filter(Boolean)
    : [
        ...document.querySelectorAll(
          "button,a[href],input,textarea,select,[role]",
        ),
      ].slice(0, 300);
  return elements
    .map((el) => {
      const type = el.getAttribute("type");
      const role =
        el.getAttribute("role") ||
        {
          BUTTON: "button",
          A: "link",
          TEXTAREA: "textbox",
          SELECT: "combobox",
        }[el.tagName] ||
        (el.tagName === "INPUT"
          ? {
              checkbox: "checkbox",
              radio: "radio",
              submit: "button",
              button: "button",
              password: "password",
            }[type] || "textbox"
          : "");
      const labelled = (el.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
      const name = (
        el.getAttribute("aria-label") ||
        labelled ||
        [...(el.labels || [])].map((l) => l.textContent).join(" ") ||
        (["button", "link"].includes(role) ? el.textContent : "") ||
        el.getAttribute("title") ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 300);
      const bounds = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        role,
        name,
        visible:
          bounds.width > 0 &&
          bounds.height > 0 &&
          style.visibility !== "hidden",
        disabled: !!el.disabled,
      };
    })
    .filter(
      (t) =>
        t.visible &&
        t.name &&
        [
          "button",
          "link",
          "textbox",
          "checkbox",
          "combobox",
          "radio",
          "switch",
        ].includes(t.role),
    )
    .map(({ role, name, disabled }) => ({ role, name, disabled }));
}

export class AuditionEngine {
  constructor(port) {
    this.port = port;
    this.lanes = [];
    this.events = [];
    this.eventSequence = 0;
    this.viewport = "desktop";
    this.busy = false;
    this.browser = null;
  }
  async exclusive(operation) {
    if (this.busy)
      throw new Error("Another action is running. Wait for it to finish.");
    this.busy = true;
    try {
      return await operation();
    } finally {
      this.busy = false;
    }
  }
  async connect(targets) {
    const validated = validateTargets(targets, this.port);
    return this.exclusive(async () => {
      await this.closeLanes();
      if (!this.browser)
        this.browser = await chromium.launch({ headless: true });
      this.events = [];
      this.eventSequence = 0;
      try {
        for (const target of validated) {
          const context = await this.browser.newContext({
            viewport: VIEWPORTS[this.viewport],
            serviceWorkers: "block",
            acceptDownloads: false,
          });
          const lane = {
            ...target,
            context,
            page: null,
            status: "ready",
            detail: "Connected",
            blocked: 0,
          };
          this.lanes.push(lane);
          await context.route("**/*", (route) => {
            try {
              localUrl(route.request().url(), this.port);
              return route.continue();
            } catch {
              lane.blocked++;
              return route.abort("blockedbyclient");
            }
          });
          // WebSocket interception is separate from ordinary HTTP routing.
          await context.routeWebSocket(/.*/, (socket) => socket.close());
          const page = await context.newPage();
          lane.page = page;
          page.setDefaultTimeout(1800);
          page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
          page.on("popup", (popup) => popup.close().catch(() => {}));
          await page.goto(target.url, {
            waitUntil: "domcontentloaded",
            timeout: 12_000,
          });
        }
      } catch (error) {
        await this.closeLanes();
        throw new Error(
          `Could not connect all previews. ${error.message.split("\n")[0]}`,
        );
      }
      return this.snapshot();
    });
  }
  async closeLanes() {
    await Promise.allSettled(this.lanes.map((l) => l.context.close()));
    this.lanes = [];
  }
  async close() {
    await this.closeLanes();
    await this.browser?.close();
    this.browser = null;
  }
  async snapshot() {
    const lanes = await Promise.all(
      this.lanes.map(async (lane, index) => {
        try {
          const [shot, controls, title] = await Promise.all([
            lane.page.screenshot({
              type: "jpeg",
              quality: 65,
              animations: "disabled",
              timeout: 5000,
            }),
            lane.page.evaluate(discoverControls),
            lane.page.title(),
          ]);
          return {
            id: index,
            name: lane.name,
            url: lane.url,
            currentUrl: lane.page.url(),
            title,
            status: lane.status,
            detail: lane.detail,
            blocked: lane.blocked,
            image: `data:image/jpeg;base64,${shot.toString("base64")}`,
            controls,
          };
        } catch {
          return {
            id: index,
            name: lane.name,
            url: lane.url,
            currentUrl: lane.url,
            status: "error",
            detail: "Preview unavailable. Reconnect the apps.",
            controls: [],
            image: "",
            blocked: lane.blocked,
          };
        }
      }),
    );
    return {
      lanes,
      events: this.events,
      viewport: this.viewport,
      dimensions: VIEWPORTS[this.viewport],
    };
  }
  async hitTest({ lane, x, y }) {
    if (
      !Number.isInteger(lane) ||
      !this.lanes[lane] ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x > VIEWPORTS[this.viewport].width ||
      y > VIEWPORTS[this.viewport].height
    )
      throw new Error("Click inside a connected preview.");
    const targets = await this.lanes[lane].page.evaluate(discoverControls, {
      x,
      y,
    });
    if (!targets[0])
      throw new Error(
        "No supported named control here. Use the action composer or add an accessible label in your app.",
      );
    return targets[0];
  }
  async act(raw) {
    const action = validateAction(raw);
    if (!this.lanes.length) throw new Error("Connect app previews first.");
    return this.exclusive(async () => {
      const outcomes = await Promise.all(
        this.lanes.map(async (lane) => {
          try {
            if (action.kind === "scroll")
              await lane.page.mouse.wheel(0, action.direction * 500);
            else if (action.kind === "press")
              await lane.page.keyboard.press(action.value);
            else {
              const locator = lane.page.getByRole(action.target.role, {
                name: action.target.name,
                exact: true,
              });
              const count = await locator.count();
              if (count !== 1)
                throw new Error(
                  count
                    ? `${count} matching controls; add unique accessible names.`
                    : `No ${action.target.role} named “${action.target.name}”.`,
                );
              if (action.kind === "fill") await locator.fill(action.value);
              else if (action.kind === "select")
                await locator.selectOption({ label: action.value });
              else await locator.click();
            }
            lane.status = "matched";
            lane.detail = "Action applied";
          } catch (error) {
            lane.status = "mismatch";
            lane.detail = error.message.split("\n")[0].slice(0, 240);
          }
          return { name: lane.name, status: lane.status, detail: lane.detail };
        }),
      );
      this.events.push({
        id: ++this.eventSequence,
        time: new Date().toISOString(),
        action: { ...action },
        outcomes,
      });
      if (this.events.length > 100) this.events.shift();
      return this.snapshot();
    });
  }
  async resize(viewport) {
    if (!Object.hasOwn(VIEWPORTS, viewport))
      throw new Error("Choose desktop or mobile.");
    return this.exclusive(async () => {
      this.viewport = viewport;
      await Promise.all(
        this.lanes.map((l) => l.page.setViewportSize(VIEWPORTS[viewport])),
      );
      return this.snapshot();
    });
  }
  async reset() {
    if (!this.lanes.length) throw new Error("Connect app previews first.");
    return this.connect(this.lanes.map(({ name, url }) => ({ name, url })));
  }
  report() {
    return {
      schemaVersion: 1,
      product: "Audition",
      createdAt: new Date().toISOString(),
      viewport: this.viewport,
      targets: this.lanes.map(({ name, url }) => ({ name, url })),
      events: this.events,
      notice:
        "Actions are observed attempts, not assertions of application correctness. Screenshots and typed values may contain private data. Reset clears browser state only, not application databases.",
    };
  }
}
