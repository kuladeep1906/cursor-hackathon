import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePRContent } from "../src/autocommit.js";

// ─── Test fixtures ────────────────────────────────────────────────────────────
const VALID_DIFF = `\
diff --git a/src/pipeline/transform.js b/src/pipeline/transform.js
index 9a7e12f..fe13a22 100644
--- a/src/pipeline/transform.js
+++ b/src/pipeline/transform.js
@@ -3,4 +3,5 @@
-  const total = order.items.reduce((sum, item) => sum + item.price, 0);
+  const total = order.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
+  const normalizedSource = (order.sourceSystem || "legacy_csv").trim();
`;

// ─── Tests ────────────────────────────────────────────────────────────────────
test("returns a markdown-formatted PR for a valid diff string", () => {
  const result = generatePRContent(VALID_DIFF);

  assert.ok(typeof result === "string", "Result must be a string");
  assert.ok(result.startsWith("# Pull Request Description"), "Must start with the PR heading");
  assert.ok(result.includes("```diff"), "Must include a diff code-fence");
  assert.ok(result.includes(VALID_DIFF.trim()), "Must embed the original diff text");
});

test("output includes required sections 'What Changed' and 'Impact Analysis'", () => {
  const result = generatePRContent(VALID_DIFF);

  assert.ok(result.includes("## What Changed"), "Must contain 'What Changed' section");
  assert.ok(result.includes("## Impact Analysis"), "Must contain 'Impact Analysis' section");
});

test("handles an empty diff string gracefully without throwing", () => {
  assert.doesNotThrow(() => generatePRContent(""), "Must not throw on empty string");
  assert.doesNotThrow(() => generatePRContent(null), "Must not throw on null");
  assert.doesNotThrow(() => generatePRContent(undefined), "Must not throw on undefined");

  const result = generatePRContent("");
  assert.ok(result.includes("## What Changed"), "Empty-diff output must still include 'What Changed'");
  assert.ok(result.includes("## Impact Analysis"), "Empty-diff output must still include 'Impact Analysis'");
});
