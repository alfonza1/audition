import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startServer } from "../server/index.mjs";

test("real browser comparison: external apps, matching, mismatches, mobile and reset", async () => {
  const app = await startServer(0);
  const base = `http://127.0.0.1:${app.port}`;
  const call = async (path, data) => {
    const response = await fetch(base + "/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: { "X-Audition": "1", "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, data: await response.json() };
  };
  const external = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<label>Task title<input></label><button>Add task</button><p id="out"></p><script>document.querySelector("button").onclick=()=>document.querySelector("#out").textContent=document.querySelector("input").value</script>',
    );
  });
  await new Promise((resolve) => external.listen(0, "127.0.0.1", resolve));
  try {
    assert.equal((await fetch(base + "/api/session")).status, 403);
    assert.equal(
      (
        await fetch(base + "/api/session", {
          headers: { "X-Audition": "1", Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("connect", {
          targets: [
            { url: "https://example.com" },
            { url: base + "/fixtures/a" },
          ],
        })
      ).status,
      400,
    );
    const ext = `http://127.0.0.1:${external.address().port}`;
    const result = await call("connect", {
      targets: [
        { name: "External", url: ext },
        { name: "A", url: base + "/fixtures/a" },
        { name: "C", url: base + "/fixtures/c" },
      ],
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.lanes.length, 3);
    assert.ok(
      result.data.lanes.every((l) => l.image.startsWith("data:image/jpeg")),
    );
    const bounds = await app.engine.lanes[1].page
      .getByRole("button", { name: "Add task", exact: true })
      .boundingBox();
    const hit = await call("hit-test", {
      lane: 1,
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    });
    assert.equal(hit.data.role, "button");
    assert.equal(hit.data.name, "Add task");
    await app.engine.lanes[1].page.evaluate(() =>
      localStorage.setItem("audition-test", "old session"),
    );
    let action = await call("action", {
      kind: "fill",
      target: { role: "textbox", name: "Task title" },
      value: "An unusually long task with <safe> text & symbols",
    });
    assert.ok(action.data.lanes.every((l) => l.status === "matched"));
    action = await call("action", {
      kind: "click",
      target: { role: "button", name: "Add task" },
    });
    assert.ok(action.data.lanes.every((l) => l.status === "matched"));
    assert.equal(
      await app.engine.lanes[0].page.locator("#out").textContent(),
      "An unusually long task with <safe> text & symbols",
    );
    assert.equal(
      await app.engine.lanes[1].page.locator("#tasks li").count(),
      3,
    );
    action = await call("action", {
      kind: "click",
      target: { role: "button", name: "Clear completed" },
    });
    assert.equal(action.data.lanes[0].status, "mismatch");
    assert.equal(action.data.lanes[1].status, "matched");
    assert.equal(action.data.lanes[2].status, "mismatch");
    assert.match(action.data.lanes[2].detail, /No button/);
    assert.equal(
      (await call("viewport", { viewport: "mobile" })).data.dimensions.width,
      390,
    );
    assert.equal((await call("hit-test", { lane: 9, x: 1, y: 1 })).status, 400);
    const report = await call("report");
    assert.equal(report.data.events.length, 3);
    let releaseOperation;
    const heldOperation = app.engine.exclusive(
      () =>
        new Promise((resolve) => {
          releaseOperation = resolve;
        }),
    );
    assert.equal((await call("session")).status, 409);
    assert.equal((await call("reset", {})).status, 409);
    releaseOperation();
    await heldOperation;
    const before = app.engine.lanes;
    assert.equal(
      (
        await call("connect", {
          targets: [
            { url: "http://127.0.0.1:1" },
            { url: base + "/fixtures/a" },
          ],
        })
      ).status,
      400,
    );
    assert.equal(app.engine.lanes, before);
    assert.equal((await call("report")).data.events.length, 3);
    const mapping = {
      lane: 2,
      source: { role: "button", name: "Clear completed" },
      target: { role: "button", name: "Archive completed" },
    };
    assert.equal(
      (await call("mappings", { mappings: [mapping, mapping] })).status,
      400,
    );
    assert.equal((await call("mappings", { mappings: [mapping] })).status, 200);
    const mapped = await call("action", {
      kind: "click",
      target: mapping.source,
    });
    assert.equal(mapped.data.lanes[2].status, "matched");
    assert.equal(mapped.data.events.at(-1).outcomes[2].mapped, true);
    await call("reset", {});
    assert.equal(
      await app.engine.lanes[1].page.evaluate(() =>
        localStorage.getItem("audition-test"),
      ),
      null,
    );
    assert.equal(
      await app.engine.lanes[1].page.locator("#tasks li").count(),
      2,
    );
    assert.equal((await call("report")).data.events.length, 0);
    assert.equal((await call("session")).data.mappings.length, 1);
    await app.engine.lanes[0].page.evaluate(() => {
      const clone = document.querySelector("button").cloneNode(true);
      document.body.append(clone);
    });
    const duplicate = await call("action", {
      kind: "click",
      target: { role: "button", name: "Add task" },
    });
    assert.match(duplicate.data.lanes[0].detail, /2 matching controls/);
    // External navigations and attempts to reach the local control API are blocked.
    await assert.rejects(
      app.engine.lanes[0].page.goto("https://example.com", { timeout: 3000 }),
    );
    await assert.rejects(
      app.engine.lanes[1].page.goto(base + "/api/session", { timeout: 3000 }),
    );
    await app.engine.browser.close();
    assert.equal((await call("reset", {})).status, 200);
    assert.ok(app.engine.lanes.every((l) => !l.page.isClosed()));
    await call("disconnect", {});
    assert.equal((await call("session")).data.lanes.length, 0);
  } finally {
    await app.close();
    await new Promise((resolve) => external.close(resolve));
  }
});

test("desktop and mobile product flow, accessible controls and export", async () => {
  const app = await startServer(0);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1512, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${app.port}`);
    await page.getByRole("button", { name: "Open the live demo →" }).click();
    await page
      .getByRole("heading", { name: "Fieldnotes", exact: true })
      .waitFor();
    await page
      .getByLabel("Text or option label")
      .fill("Ship a thoughtful first release");
    await page.getByRole("button", { name: "Fill all →" }).click();
    await page
      .getByRole("button", { name: "Fill all →" })
      .waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector(".busy"));
    await page
      .getByLabel("Control from first preview")
      .selectOption({ label: "button · Add task" });
    await page.getByRole("button", { name: "Click in all →" }).click();
    await page.waitForFunction(() => !document.querySelector(".busy"));
    assert.equal(
      await app.engine.lanes[0].page.locator("#tasks li").count(),
      3,
    );
    await page
      .getByLabel("Control from first preview")
      .selectOption({ label: "button · Clear completed" });
    await page.getByRole("button", { name: "Click in all →" }).click();
    await page.getByText("Unmatched action", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Pick", exact: true })
      .first()
      .click();
    await page
      .getByLabel("What should the next iteration keep or change?")
      .fill(
        "Keep the first layout. Resolve the clear-button mismatch in Taskline.",
      );
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Restore draft", exact: true })
      .click();
    await page
      .getByText("Draft restored with fresh browsers.", { exact: false })
      .waitFor();
    assert.match(
      await page
        .getByLabel("What should the next iteration keep or change?")
        .inputValue(),
      /Keep the first/,
    );
    await page
      .getByLabel("Control from first preview")
      .selectOption({ label: "button · Clear completed" });
    await page.locator(".mapping-panel summary").click();
    await page
      .getByLabel("Map control in Taskline")
      .selectOption({ label: "Archive completed" });
    await page.waitForFunction(() => !document.querySelector(".busy"));
    await page.getByRole("button", { name: "Click in all →" }).click();
    await page.waitForFunction(() => !document.querySelector(".busy"));
    assert.ok(app.engine.lanes.every((l) => l.status === "matched"));
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page
      .getByRole("button", { name: "Restore draft", exact: true })
      .click();
    await page
      .getByText("Draft restored with fresh browsers.", { exact: false })
      .waitFor();
    assert.equal(app.engine.mappings.length, 1);
    await page
      .getByLabel("Control from first preview")
      .selectOption({ label: "button · Clear completed" });
    await page.getByRole("button", { name: "Click in all →" }).click();
    await page.waitForFunction(() => !document.querySelector(".busy"));
    await mkdir("docs/images", { recursive: true });
    await page.screenshot({
      path: "docs/images/workspace.png",
      fullPage: true,
    });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export review ↗" }).click();
    assert.equal(
      (await downloadPromise).suggestedFilename(),
      "audition-review.json",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Mobile", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".busy"));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
    await page.evaluate(() => {
      const draft = JSON.parse(localStorage.getItem("audition-draft-v1"));
      draft.targets[0].url = "https://example.com";
      localStorage.setItem("audition-draft-v1", JSON.stringify(draft));
    });
    await page
      .getByRole("button", { name: "Restore draft", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Only localhost" })
      .waitFor();
    assert.equal(app.engine.lanes.length, 3);
    assert.equal(app.engine.mappings.length, 1);
    await page
      .getByRole("button", { name: "Forget draft", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restore draft", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "No saved draft" })
      .waitFor();
    assert.equal(app.engine.lanes.length, 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await app.close();
  }
});
