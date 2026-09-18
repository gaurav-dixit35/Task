import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  dateSortValue,
  formatLocalDateTime,
  nextRecurringDueDate,
  normaliseTags,
  toTaskDate,
} from "../task-utils.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const results = [];

async function check(name, callback) {
  try {
    await callback();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`✗ ${name}\n  ${error.message}`);
  }
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() && entry.name !== ".git" ? filesIn(path) : entry.isFile() ? [path] : [];
  });
}

await check("unit: task date conversion safely supports Firestore timestamps and invalid values", () => {
  const firestoreTimestamp = { toDate: () => new Date("2026-09-20T09:00:00Z") };
  assert.equal(toTaskDate("not a date"), null);
  assert.equal(toTaskDate(firestoreTimestamp)?.toISOString(), "2026-09-20T09:00:00.000Z");
  assert.equal(dateSortValue(null), Number.MAX_SAFE_INTEGER);
  assert.ok(dateSortValue("2026-01-01") < dateSortValue("2026-02-01"));
  assert.match(formatLocalDateTime("2026-09-20T09:00:00Z"), /^2026-09-20T/);
});

await check("unit: recurrence always moves to the next valid occurrence", () => {
  const now = new Date("2026-09-20T12:00:00");
  assert.equal(nextRecurringDueDate({ recurrence: "daily", dueDate: "2026-09-18T09:00" }, now), "2026-09-21T09:00");
  assert.equal(nextRecurringDueDate({ recurrence: "weekly", dueDate: "2026-09-13T09:00" }, now), "2026-09-27T09:00");
  assert.equal(nextRecurringDueDate({ recurrence: "none", dueDate: "2026-09-20T09:00" }, now), null);
  assert.equal(nextRecurringDueDate({ recurrence: "daily", dueDate: "invalid" }, now), null);
});

await check("unit: tags are normalised, unique, safe, and bounded", () => {
  assert.deepEqual(normaliseTags("#Work, work, $$$, personal!, long tag, #health"), ["work", "personal", "longtag", "health"]);
  assert.equal(normaliseTags(Array.from({ length: 12 }, (_, index) => `tag${index}`).join(",")).length, 8);
});

await check("integration: main page, task UI, and Karya AI use matching element contracts", () => {
  const html = read("index.html");
  ["taskForm", "taskInput", "projectInput", "tagsInput", "dueInput", "prioritySelect", "repeatSelect", "taskList", "taskDetailsDialog", "taskDetailsForm", "taskDescriptionInput", "taskEstimateInput", "taskRecurrenceSelect", "subtaskList", "subtaskInput", "karyaAiBtn", "karyaAiPanel", "karyaInput", "sendBtn", "aiVoiceBtn", "toggleSpeechBtn", "startNewChat", "openHistory", "rateUsBtn"].forEach((id) => assert.match(html, new RegExp(`id=["']${id}["']`), `Missing #${id}`));
  assert.match(read("script.js"), /from "\.\/task-utils\.js"/);
  assert.match(read("Karyaai/ai.js"), /from "\.\.\/task-utils\.js"/);
  assert.match(read("script.js"), /writeBatch/);
  assert.match(read("Karyaai/ai.js"), /writeBatch/);
  assert.match(read("Karyaai/online-brain.js"), /\.netlify\/functions\/karya-ai/);
});

await check("integration: service-worker cache contains only files present in this project", () => {
  const cachedFiles = [...read("service-worker.js").matchAll(/"([^"\n]+\.(?:html|css|js|png|mp3))"/g)].map((match) => match[1]);
  assert.ok(cachedFiles.length > 10);
  cachedFiles.forEach((file) => assert.ok(existsSync(`${root}/${file}`), `Cache file missing: ${file}`));
});

await check("integration: protected Advanced AI endpoint rejects unauthenticated requests", async () => {
  const { default: handler } = await import("../netlify/functions/karya-ai.mjs");
  assert.equal((await handler(new Request("http://localhost/karya-ai", { method: "GET" }))).status, 405);
  assert.equal((await handler(new Request("http://localhost/karya-ai", { method: "POST" }))).status, 401);
});

await check("system: source has no merge markers, CSS is balanced, and security rules remain present", () => {
  filesIn(root).filter((file) => /\.(?:js|mjs|html|css|md)$/i.test(file)).forEach((file) => {
    assert.doesNotMatch(readFileSync(file, "utf8"), /^(<<<<<<<|=======|>>>>>>>)/m, `Merge marker in ${file}`);
  });
  ["style.css", "set.css", "Karyaai/ai.css"].forEach((file) => {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    for (const character of css) { if (character === "{") depth += 1; if (character === "}") depth -= 1; assert.ok(depth >= 0, `${file} closes a block before opening one`); }
    assert.equal(depth, 0, `${file} has unbalanced braces`);
  });
  const rules = read("firestore.rules");
  assert.match(rules, /allow read: if isOwner\(userId\)/);
  assert.match(rules, /request\.resource\.data\.uid == request\.auth\.uid/);
  assert.doesNotMatch(read("Karyaai/online-brain.js"), /AIza|GEMINI_API_KEY/);
  ["index.html", "login.html", "settings.html"].forEach((page) => {
    const ids = [...read(page).matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs in ${page}`);
  });
});

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
if (failures.length) process.exitCode = 1;
