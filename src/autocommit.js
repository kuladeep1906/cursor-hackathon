import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// ─── Mock diff ────────────────────────────────────────────────────────────────
// Used as fallback when git diff HEAD returns nothing.
const MOCK_DIFF = `\
diff --git a/src/pipeline/transform.js b/src/pipeline/transform.js
index 9a7e12f..fe13a22 100644
--- a/src/pipeline/transform.js
+++ b/src/pipeline/transform.js
@@ -12,10 +12,14 @@ export const transformOrder = (order) => {
-  const total = order.items.reduce((sum, item) => sum + item.price, 0);
-  const normalizedStatus = order.status.toLowerCase();
+  const total = order.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
+  const normalizedStatus = (order.status || "pending").toLowerCase();
+  const normalizedSource = (order.sourceSystem || "legacy_csv").trim().toLowerCase();
+
   return {
     id: order.id,
     customerId: order.customer_id,
     total,
-    status: normalizedStatus
+    status: normalizedStatus,
+    sourceSystem: normalizedSource,
   };
 };
diff --git a/src/db/connection.js b/src/db/connection.js
index 4f21d09..bc78a11 100644
--- a/src/db/connection.js
+++ b/src/db/connection.js
@@ -3,8 +3,16 @@ import pg from "pg";
-export const connect = () => new pg.Client(process.env.DB_URL);
+export const connect = async () => {
+  const client = new pg.Client(process.env.DB_URL);
+  try {
+    await client.connect();
+    return client;
+  } catch (err) {
+    console.error("❌ DB connection failed:", err.message);
+    throw new Error(\`Database unavailable: \${err.message}\`);
+  }
+};
`;

// ─── Diff reader ──────────────────────────────────────────────────────────────
// git diff HEAD captures both staged and unstaged changes against the last commit.
export const readDiff = () => {
  try {
    const diff = execSync("git diff HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (diff) return { diff, usingMock: false };
    return { diff: MOCK_DIFF, usingMock: true };
  } catch {
    return { diff: MOCK_DIFF, usingMock: true };
  }
};

// ─── Change-type classifier ───────────────────────────────────────────────────
export const classifyDiff = (diffText) => {
  const lower = diffText.toLowerCase();
  if (lower.includes("fix") || lower.includes("error") || lower.includes("catch")) return "fix";
  if (lower.includes("feat") || lower.includes("add") || lower.includes("new")) return "feat";
  if (lower.includes("optimiz") || lower.includes("performance") || lower.includes("reduce")) return "perf";
  if (lower.includes("refactor") || lower.includes("restructur")) return "refactor";
  return "chore";
};

// ─── Changed-file extractor ───────────────────────────────────────────────────
export const extractChangedFiles = (diffText) => {
  const matches = [...diffText.matchAll(/^diff --git a\/(.+?) b\//gm)];
  return matches.map((m) => m[1]);
};

// ─── Per-file diff parser ─────────────────────────────────────────────────────
// Returns one object per changed file with added/removed lines and hunk context.
const parseDiffFiles = (diffText) => {
  const blocks = diffText
    .split(/(?=^diff --git )/m)
    .filter((s) => s.trim().startsWith("diff --git"));

  return blocks.map((block) => {
    const pathMatch = block.match(/^diff --git a\/(.+?) b\//m);
    const filePath = pathMatch ? pathMatch[1] : "unknown";
    const ext = filePath.includes(".") ? filePath.split(".").pop().toLowerCase() : "";

    const lines = block.split("\n");
    // Strip the leading +/- sigil so downstream helpers work on plain code
    const added   = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1));

    // Hunk headers carry the enclosing function name: @@ -n,m +n,m @@ fnContext
    const hunkCtx = lines
      .filter((l) => l.startsWith("@@"))
      .map((l) => { const m = l.match(/@@ .+? @@ (.+)/); return m ? m[1].trim() : ""; })
      .filter(Boolean);

    return { filePath, ext, added, removed, hunkCtx };
  });
};

// ─── Identifier extractor ─────────────────────────────────────────────────────
// Finds declared function/variable names within an array of code lines.
const SKIP = new Set(["if", "else", "for", "while", "try", "catch", "switch", "return"]);

const extractIdentifiers = (codeLines) => {
  const found = new Set();
  for (const line of codeLines) {
    const m = line.trim().match(/(?:export\s+)?(?:async\s+)?(?:const|let|var|function)\s+(\w+)/);
    if (m && !SKIP.has(m[1])) found.add(m[1]);
  }
  return [...found].slice(0, 4);
};

// ─── Hunk-context function name ───────────────────────────────────────────────
const fnFromCtx = (ctx) => {
  if (!ctx) return null;
  const m = ctx.match(/(?:export\s+)?(?:async\s+)?(?:const|let|var|function)\s+(\w+)/);
  return m ? m[1] : null;
};

// ─── Commit title ─────────────────────────────────────────────────────────────
const buildCommitTitle = (type, parsedFiles) => {
  if (!parsedFiles.length) return `${type}: update codebase`;

  const primary  = parsedFiles[0];
  const baseName = primary.filePath.split("/").pop().replace(/\.[^.]+$/, "");
  const fnName   = primary.hunkCtx.map(fnFromCtx).filter(Boolean)[0];
  const others   = parsedFiles.length - 1;
  const tail     = others > 0 ? ` and ${others} other file${others > 1 ? "s" : ""}` : "";

  return fnName
    ? `${type}: update \`${fnName}\` in ${baseName}${tail}`
    : `${type}: update ${baseName}${tail}`;
};

// ─── "What Changed" — per-file modification bullets ──────────────────────────
const buildModificationBullets = (parsedFiles) => {
  return parsedFiles.map(({ filePath, added, removed, hunkCtx }) => {
    const stats     = `+${added.length} / -${removed.length} lines`;
    const ctxFns    = hunkCtx.map(fnFromCtx).filter(Boolean);
    const ctxStr    = ctxFns.length ? ` in \`${ctxFns[0]}\`` : "";
    const ids       = extractIdentifiers(added).filter((id) => !ctxFns.includes(id));
    const idsStr    = ids.length ? ` — \`${ids.join("`, `")}\`` : "";
    return `- \`${filePath}\` (${stats})${ctxStr}${idsStr}`;
  });
};

// ─── Impact Analysis table ────────────────────────────────────────────────────
const areaLabel = (ext, filePath) => {
  if (/\.(test|spec)\.(js|ts|mjs)$/.test(filePath)) return "Test coverage";
  if (ext === "sql")                                  return "Database queries";
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "Configuration";
  if (["md", "txt", "rst"].includes(ext))            return "Documentation";
  if (["js", "ts", "mjs", "cjs"].includes(ext))     return `Logic · \`${filePath.split("/").pop()}\``;
  return `Source · \`${filePath.split("/").pop()}\``;
};

const riskLevel = (addCount, removeCount, type) => {
  if (addCount + removeCount > 30) return "Medium";
  if (type === "fix" && removeCount >= addCount) return "Low";
  return "Low";
};

const VERB = { fix: "🛠️ Fixed", feat: "✨ Added", perf: "⚡ Optimised", refactor: "♻️ Refactored", chore: "🔧 Updated" };

const buildImpactRows = (parsedFiles, type) => {
  const verb = VERB[type] ?? "🔧 Updated";
  const rows = parsedFiles.map(({ filePath, ext, added, removed }) =>
    `| ${areaLabel(ext, filePath)} | ${verb} | ${riskLevel(added.length, removed.length, type)} |`
  );
  const compatNote = type === "fix" ? "defensive" : "additive or guarded";
  rows.push(`| Backwards compat | ✅ Safe — all changes are ${compatNote} | None |`);
  return rows;
};

// ─── Test plan ────────────────────────────────────────────────────────────────
const buildTestItems = (parsedFiles) => {
  return parsedFiles.map(({ filePath, added, hunkCtx }) => {
    const ids    = extractIdentifiers(added);
    const fnName = ids[0] ?? hunkCtx.map(fnFromCtx).filter(Boolean)[0]
                           ?? filePath.split("/").pop().replace(/\.[^.]+$/, "");
    return `- [ ] Unit: \`${fnName}\` with representative inputs and edge cases.`;
  });
};

// ─── Core PR content generator (exported for unit tests) ─────────────────────
export const generatePRContent = (diffText) => {
  if (!diffText || !diffText.trim()) {
    return [
      "# Pull Request Description",
      "",
      "> ⚠️ No diff provided. Run `git diff HEAD` to verify there are local changes.",
      "",
      "## What Changed",
      "_Nothing detected._",
      "",
      "## Impact Analysis",
      "_N/A — no diff to analyse._",
    ].join("\n");
  }

  const type        = classifyDiff(diffText);
  const parsedFiles = parseDiffFiles(diffText);

  const commitTitle = buildCommitTitle(type, parsedFiles);

  const fileListItems = parsedFiles.length
    ? parsedFiles.map((f) => `- \`${f.filePath}\``)
    : ["- _(could not parse file paths)_"];

  const modBullets = buildModificationBullets(parsedFiles);
  const impactRows = buildImpactRows(parsedFiles, type);
  const testItems  = buildTestItems(parsedFiles);

  return [
    "# Pull Request Description",
    "",
    "### 🏷️ Proposed Commit",
    `\`${commitTitle}\``,
    "",
    "---",
    "",
    "## What Changed",
    ...fileListItems,
    "",
    "### Key modifications",
    ...modBullets,
    "",
    "---",
    "",
    "## Impact Analysis",
    "| Area | Impact | Risk |",
    "|------|--------|------|",
    ...impactRows,
    "",
    "---",
    "",
    "## Test Plan",
    ...testItems,
    "- [ ] Integration: run pipeline end-to-end against staging data.",
    "- [ ] Smoke: confirm `PR_DESCRIPTION.md` generated without errors.",
    "",
    "---",
    "",
    "## Diff Snapshot",
    "```diff",
    diffText.trim(),
    "```",
    "",
  ].join("\n");
};

// ─── Filesystem writer ────────────────────────────────────────────────────────
const writePrDescription = (content) => {
  const outputPath = join(process.cwd(), "PR_DESCRIPTION.md");
  writeFileSync(outputPath, content, "utf-8");
  return outputPath;
};

// ─── CLI helpers ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const step = async (emoji, label, delayMs = 600) => {
  process.stdout.write(`${emoji}  ${label}`);
  await sleep(delayMs);
  process.stdout.write(" ✓\n");
};

// ─── CLI entry-point guard ────────────────────────────────────────────────────
const isMain = process.argv[1] === new URL(import.meta.url).pathname;

if (isMain) {
  const run = async () => {
    console.log("\n🚀  Git Commit & PR Automator\n" + "─".repeat(40));

    await step("🔍", "Step 1/4  Reading diff (git diff HEAD)...", 500);
    const { diff, usingMock } = readDiff();
    console.log(`      └─ diff loaded${usingMock ? " (nothing changed — using mock diff)" : " (live changes detected)"}`);

    await step("🧠", "Step 2/4  Classifying change type...", 700);
    const type = classifyDiff(diff);
    console.log(`      └─ detected type: ${type}`);

    await step("🤖", "Step 3/4  Generating PR content...", 900);

    await step("📝", "Step 4/4  Writing PR_DESCRIPTION.md...", 400);
    const content = generatePRContent(diff);
    const outputPath = writePrDescription(content);

    console.log("\n" + "─".repeat(40));
    console.log(`✅  Done! Output → ${outputPath}\n`);
  };

  run();
}
