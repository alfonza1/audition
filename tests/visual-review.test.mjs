import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/visual-review.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { visualReviewHtml } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const privateText = "<script>PRIVATE_SECRET</script>";
const review = {
  viewport: "desktop",
  lanes: [
    {
      name: privateText,
      currentUrl: "http://localhost:9999/PRIVATE_URL",
      image: "data:image/jpeg;base64,YQ==",
      status: "matched",
    },
  ],
  events: [
    {
      id: 1,
      action: {
        kind: "fill",
        target: { name: "PRIVATE_CONTROL" },
        value: "PRIVATE_VALUE",
      },
      outcomes: [
        {
          name: privateText,
          status: "matched",
          detail: "PRIVATE_DETAIL",
          mapped: true,
        },
      ],
    },
  ],
};
test("visual reviews omit private fields by default and retain useful action evidence", () => {
  const html = visualReviewHtml(review, {
    privateContent: false,
    winner: 0,
    feedback: "PRIVATE_NOTES",
  });
  assert.doesNotMatch(html, /PRIVATE_|data:image\/jpeg/);
  assert.match(html, /Preview A/);
  assert.match(html, /fill/);
  assert.match(html, /matched · mapped/);
});
test("private visual reviews escape all untrusted content and reject non-JPEG image sources", () => {
  const html = visualReviewHtml(review, {
    privateContent: true,
    winner: 0,
    feedback: privateText,
  });
  assert.match(html, /&lt;script&gt;PRIVATE_SECRET&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /PRIVATE_VALUE/);
  const unsafe = structuredClone(review);
  unsafe.lanes[0].image = "javascript:alert(1)";
  assert.doesNotMatch(
    visualReviewHtml(unsafe, {
      privateContent: true,
      winner: null,
      feedback: "",
    }),
    /javascript:/,
  );
  assert.match(html, /default-src 'none'/);
});
