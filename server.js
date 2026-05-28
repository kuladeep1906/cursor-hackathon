import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  readStagedDiff,
  generatePRContent,
  classifyDiff,
  extractChangedFiles,
} from "./src/autocommit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.static(join(__dirname, "public")));

app.get("/api/generate", (_req, res) => {
  try {
    const { diff, usingMock } = readStagedDiff();
    const markdown = generatePRContent(diff);
    const changeType = classifyDiff(diff);
    const files = extractChangedFiles(diff);
    res.json({ markdown, changeType, files, usingMock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀  PR Automator UI  →  http://localhost:${PORT}`);
  console.log(`📂  Serving static files from ./public\n`);
});
