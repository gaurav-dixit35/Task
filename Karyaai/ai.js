import { auth, db } from "../firebase.js";
import { onlineBrain } from "./online-brain.js";
import { karyaBrain } from "./ai-brain.js";
import { dateSortValue, nextRecurringDueDate, toTaskDate } from "../task-utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Karya AI is task-first: it reads and changes the signed-in user's Firestore
// tasks. It does not use an exposed browser API key or claim to be trained.
const HISTORY_KEY = "karya_ai_history_v4";
const MEMORY_KEY = "karya_ai_memory_v2";
const el = {
  button: document.getElementById("karyaAiBtn"), panel: document.getElementById("karyaAiPanel"),
  close: document.getElementById("closeAi"), messages: document.getElementById("karyaMessages"),
  input: document.getElementById("karyaInput"), send: document.getElementById("sendBtn"),
  voice: document.getElementById("aiVoiceBtn"), speech: document.getElementById("toggleSpeechBtn"),
  newChat: document.getElementById("startNewChat"), history: document.getElementById("openHistory"),
  actionButtons: document.querySelectorAll(".action-btn"),
};
let user = null, currentAction = "chat", processing = false, speechEnabled = true, recognition = null, listening = false, history = [];
let state = { pendingConfirmation: null, pendingGeminiQuestion: null, lastTask: null, focusMode: false };
const FREE_AI_DAILY_LIMIT = 12;

function memoryKey() { return `${MEMORY_KEY}_${user?.uid || "anon"}`; }
function aiPreferenceKey(name) { return `karya_ai_${name}_${user?.uid || "anon"}`; }
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || ""); }
  catch { return fallback; }
}
function loadState() {
  state = { ...state, ...readJSON(memoryKey(), {}), pendingConfirmation: null };
  history = readJSON(`${HISTORY_KEY}_${user?.uid || "anon"}`, []);
  speechEnabled = localStorage.getItem(aiPreferenceKey("speech")) !== "off";
  if (el.speech) el.speech.textContent = speechEnabled ? "🔊" : "🔇";
}
function saveState() {
  const { pendingConfirmation, pendingGeminiQuestion, ...persisted } = state;
  localStorage.setItem(memoryKey(), JSON.stringify(persisted));
}
function aiUsageKey() { return `karya_ai_usage_${user?.uid || "anon"}`; }
function canUseAdvancedAI() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = readJSON(aiUsageKey(), {});
  return usage.date !== today || Number(usage.count || 0) < FREE_AI_DAILY_LIMIT;
}
function recordAdvancedAIUse() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = readJSON(aiUsageKey(), {});
  localStorage.setItem(aiUsageKey(), JSON.stringify({
    date: today,
    count: usage.date === today ? Number(usage.count || 0) + 1 : 1,
  }));
}
function hasGeminiConsent() {
  return localStorage.getItem(`karya_gemini_consent_${user?.uid || "anon"}`) === "allowed";
}
function selectTaskContext(tasks) {
  return [...tasks]
    .sort((a, b) =>
      Number(Boolean(a.completed)) - Number(Boolean(b.completed)) ||
      Number(b.priority === "high") - Number(a.priority === "high") ||
      dateSortValue(a.dueDate) - dateSortValue(b.dueDate)
    )
    .slice(0, 12);
}
function saveMessage(type, text) {
  history = [...history, { type, text, time: Date.now() }].slice(-100);
  localStorage.setItem(`${HISTORY_KEY}_${user?.uid || "anon"}`, JSON.stringify(history));
}
function append(className, text) {
  const message = document.createElement("div");
  message.className = `karya-msg ${className}`;
  message.textContent = text;
  el.messages.appendChild(message);
  el.messages.scrollTop = el.messages.scrollHeight;
}
function system(text) {
  const message = document.createElement("div");
  message.className = "karya-system";
  message.textContent = text;
  el.messages.appendChild(message);
  el.messages.scrollTop = el.messages.scrollHeight;
}
function say(text) {
  const clean = String(text || "I couldn't prepare a response.").trim();
  append("karya-ai", clean); saveMessage("ai", clean);
  if (speechEnabled && !state.focusMode && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean); utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
}
function sayUser(text) { append("karya-user", text); saveMessage("user", text); }
async function getTasks() {
  if (!user) return [];
  const snapshot = await getDocs(collection(db, "users", user.uid, "tasks"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
async function refreshTaskUI() {
  if (typeof window.loadTasksFromFirestore === "function") await window.loadTasksFromFirestore();
}
async function askGemini(question) {
  if (!navigator.onLine) return localAssistantAnswer(question, "You are offline, so I used Karya's local planning assistant.");
  if (!canUseAdvancedAI()) return localAssistantAnswer(question, `You have reached today's ${FREE_AI_DAILY_LIMIT}-question Advanced AI limit, so I used Karya's local planning assistant.`);
  let timeout;
  try {
    const token = await user.getIdToken();
    const tasks = selectTaskContext(await getTasks());
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 20000);
    const reply = await onlineBrain({
      question,
      token,
      tasks,
      history: history.slice(-6),
      preferences: { responseStyle: localStorage.getItem(aiPreferenceKey("response_style")) || "balanced" },
      signal: controller.signal,
    });
    recordAdvancedAIUse();
    say(reply);
  } catch (error) {
    console.error("Gemini fallback failed:", error);
    await localAssistantAnswer(question, error.name === "AbortError" ? "Advanced AI took too long, so I used Karya's local planning assistant." : "Advanced AI is unavailable, so I used Karya's local planning assistant.");
  } finally {
    clearTimeout(timeout);
  }
}
async function localAssistantAnswer(question, prefix = "") {
  try {
    const result = await karyaBrain({
      text: question,
      user,
      tasks: await getTasks(),
      context: { focusMode: state.focusMode },
      memory: { preferredTone: localStorage.getItem(aiPreferenceKey("response_style")) || "balanced" },
    });
    const reply = result?.reply || "I can still manage tasks locally. Try “help” to see supported commands.";
    say(`${prefix ? `${prefix}\n\n` : ""}${reply}`);
  } catch (error) {
    console.error("Local assistant fallback failed:", error);
    say("I can still manage your tasks directly. Try “help” to see supported commands.");
  }
}
function normalise(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function formatDate(value) { return toTaskDate(value)?.toLocaleString() || "no due date"; }
function taskLabel(task) { return `“${task.name}”${task.dueDate ? ` — ${formatDate(task.dueDate)}` : ""}`; }
function priorityFrom(text) {
  if (/\b(high|urgent|asap|critical|important)\b/i.test(text)) return "high";
  if (/\b(low|optional|whenever|someday)\b/i.test(text)) return "low";
  return /\b(medium|normal)\b/i.test(text) ? "medium" : null;
}
function tagsFromText(text) {
  return [...new Set((text.match(/#[a-z0-9_-]{1,24}/gi) || [])
    .map((tag) => tag.slice(1).toLowerCase()))].slice(0, 8);
}
function projectFromText(text) {
  const match = text.match(/\bproject\s*:\s*([^,#]+?)(?=\s+#|\s+(?:today|tomorrow|at|high|medium|low|daily|weekly|every)\b|$)/i);
  return match ? match[1].trim().slice(0, 40) : "Inbox";
}
function recurrenceFrom(text) {
  if (/\b(every week|weekly)\b/i.test(text)) return "weekly";
  return /\b(every day|daily)\b/i.test(text) ? "daily" : "none";
}
function parseDate(text) {
  const lower = text.toLowerCase();
  if (!/\b(today|tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|daily|every day|weekly|every week|at \d|\d{1,2}(:\d{2})?\s*(am|pm)|in \d+ (minute|hour|day))\b/i.test(lower)) return null;
  const date = new Date(); date.setSeconds(0, 0);
  if (/weekly|every week/i.test(lower)) date.setDate(date.getDate() + 7);
  else if (/day after tomorrow/i.test(lower)) date.setDate(date.getDate() + 2);
  else if (/tomorrow/i.test(lower)) date.setDate(date.getDate() + 1);
  else {
    const inTime = lower.match(/in\s+(\d+)\s+(minute|hour|day)s?/);
    if (inTime) {
      const amount = Number(inTime[1]);
      if (inTime[2] === "minute") date.setMinutes(date.getMinutes() + amount);
      if (inTime[2] === "hour") date.setHours(date.getHours() + amount);
      if (inTime[2] === "day") date.setDate(date.getDate() + amount);
    } else {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const requested = days.find((day) => lower.includes(day));
      if (requested) date.setDate(date.getDate() + ((days.indexOf(requested) - date.getDay() + 7) % 7 || 7));
    }
  }
  let hour = /evening/i.test(lower) ? 18 : /afternoon/i.test(lower) ? 14 : /night/i.test(lower) ? 21 : /noon/i.test(lower) ? 12 : 9;
  let minute = 0;
  const clock = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (clock) { hour = Number(clock[1]); minute = Number(clock[2] || 0); if (clock[3] === "pm" && hour < 12) hour += 12; if (clock[3] === "am" && hour === 12) hour = 0; }
  date.setHours(hour, minute, 0, 0);
  if (!/tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekly|every week|in \d+ day/i.test(lower) && date < new Date()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}
function titleFromAdd(text) {
  return text.replace(/^(add|create|schedule|plan|remind me to)\s+(a\s+)?(task\s+)?/i, "")
    .replace(/\bproject\s*:\s*([^,#]+?)(?=\s+#|\s+(?:today|tomorrow|at|high|medium|low)\b|$)/gi, "")
    .replace(/#[a-z0-9_-]{1,24}/gi, "")
    .replace(/\b(every day|daily|every week|weekly)\b/gi, "")
    .replace(/\b(with )?(high|medium|low|urgent|asap|critical|important|optional)\s*(priority)?\b/gi, "")
    .replace(/\b(day after tomorrow|tomorrow|today|this (morning|afternoon|evening|night)|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?|in\s+\d+\s+(minutes?|hours?|days?)|\d{1,2}(?::\d{2})?\s*(am|pm))\b/gi, "")
    .replace(/\s+/g, " ").trim().replace(/[,.]$/, "");
}
function findTask(tasks, requested) {
  const needle = normalise(requested);
  if ((!needle || /^(it|that|this|last task)$/.test(needle)) && state.lastTask) return tasks.find((task) => task.id === state.lastTask.id);
  if (/^(first|next) task$/.test(needle)) return tasks.filter((task) => !task.completed).sort((a, b) => dateSortValue(a.dueDate) - dateSortValue(b.dueDate))[0] || null;
  if (/^last task$/.test(needle)) return tasks[tasks.length - 1] || null;
  const exact = tasks.find((task) => normalise(task.name) === needle); if (exact) return exact;
  const matches = tasks.map((task) => {
    const words = needle.split(" ").filter(Boolean); const title = normalise(task.name);
    return { task, score: words.filter((word) => title.includes(word)).length / Math.max(words.length, 1) };
  }).filter((match) => match.score >= .5).sort((a, b) => b.score - a.score);
  return matches.length === 1 || (matches[0] && matches[0].score > (matches[1]?.score || 0)) ? matches[0].task : null;
}
function taskReference(text) {
  return text.replace(/^(mark|complete|finish|done|reopen|undo|uncomplete|delete|remove|edit|update|change|rename)\s+(the\s+)?(task\s+)?/i, "")
    .replace(/\b(as\s+)?(completed|complete|done|pending|unfinished)\b/gi, "")
    .replace(/\b(to\s+)?(high|medium|low)\s+(priority)?\b/gi, "")
    .replace(/\b(due\s+)?(today|tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+\d{1,2}.*)$/i, "").trim();
}
async function addTask(text) {
  const title = titleFromAdd(text).slice(0, 240);
  if (!title) return say("What should I add? Example: Add submit report tomorrow at 5 pm, high priority.");
  const task = {
    name: title,
    priority: priorityFrom(text) || "medium",
    project: projectFromText(text),
    tags: tagsFromText(text),
    status: "open",
    description: "",
    estimatedMinutes: 0,
    subtasks: [],
    recurrence: recurrenceFrom(text),
    dueDate: parseDate(text),
    completed: false,
    notified: false,
    warned: false,
    snoozedUntil: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const created = await addDoc(collection(db, "users", user.uid, "tasks"), task);
  state.lastTask = { id: created.id, ...task }; saveState(); await refreshTaskUI();
  say(`Added ${taskLabel(task)} (${task.priority} priority, ${task.project})${task.recurrence !== "none" ? `, repeats ${task.recurrence}` : ""}.`);
}
async function listTasks(text) {
  const tasks = await getTasks(), now = new Date(); let selected = tasks, heading = "Your tasks";
  if (/completed|done|finished/i.test(text)) { selected = tasks.filter((task) => task.completed); heading = "Completed tasks"; }
  else if (/pending|open|incomplete|not done/i.test(text)) { selected = tasks.filter((task) => !task.completed); heading = "Open tasks"; }
  else if (/overdue|late|missed/i.test(text)) { selected = tasks.filter((task) => !task.completed && toTaskDate(task.dueDate) && toTaskDate(task.dueDate) < now); heading = "Overdue tasks"; }
  else if (/today/i.test(text)) { selected = tasks.filter((task) => toTaskDate(task.dueDate)?.toDateString() === now.toDateString()); heading = "Tasks due today"; }
  else if (/tomorrow/i.test(text)) { const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); selected = tasks.filter((task) => toTaskDate(task.dueDate)?.toDateString() === tomorrow.toDateString()); heading = "Tasks due tomorrow"; }
  const projectMatch = text.match(/\bproject\s*:?[\s]+([^,#]+?)(?=\s+#|$)/i);
  const tagMatch = text.match(/#([a-z0-9_-]{1,24})/i);
  if (projectMatch) {
    const project = normalise(projectMatch[1]);
    selected = selected.filter((task) => normalise(task.project || "Inbox") === project);
    heading += ` in ${projectMatch[1].trim()}`;
  }
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    selected = selected.filter((task) => (task.tags || []).map((item) => String(item).toLowerCase()).includes(tag));
    heading += ` tagged #${tag}`;
  }
  selected.sort((a, b) => Number(a.completed) - Number(b.completed) || dateSortValue(a.dueDate) - dateSortValue(b.dueDate));
  if (!selected.length) return say(`${heading}: none.`);
  state.lastTask = selected[0]; saveState();
  say(`${heading} (${selected.length}):\n${selected.slice(0, 10).map((task, index) => `${index + 1}. ${task.completed ? "✓" : "•"} ${taskLabel(task)} [${task.priority || "medium"}]`).join("\n")}${selected.length > 10 ? `\n…and ${selected.length - 10} more.` : ""}`);
}
async function analyseTasks() {
  const tasks = await getTasks(), pending = tasks.filter((task) => !task.completed), completed = tasks.length - pending.length;
  const overdue = pending.filter((task) => toTaskDate(task.dueDate) && toTaskDate(task.dueDate) < new Date()), high = pending.filter((task) => task.priority === "high");
  const next = [...pending].sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high") || dateSortValue(a.dueDate) - dateSortValue(b.dueDate))[0];
  state.lastTask = next || null; saveState();
  say(`Task overview:\n• Total: ${tasks.length}\n• Completed: ${completed}\n• Open: ${pending.length}\n• Overdue: ${overdue.length}\n• High priority open: ${high.length}${next ? `\n\nBest next step: ${taskLabel(next)}.` : "\n\nYou have no open tasks — nice work."}`);
}
async function showReminders() {
  const now = new Date();
  const upcoming = (await getTasks())
    .filter((task) => !task.completed && toTaskDate(task.dueDate))
    .sort((a, b) => dateSortValue(a.dueDate) - dateSortValue(b.dueDate));
  if (!upcoming.length) return say("You have no scheduled open tasks.");
  const overdue = upcoming.filter((task) => toTaskDate(task.dueDate) < now);
  const next = upcoming.filter((task) => toTaskDate(task.dueDate) >= now);
  say(`${overdue.length ? `Overdue (${overdue.length}):\n${overdue.slice(0, 3).map((task) => `• ${taskLabel(task)}`).join("\n")}\n\n` : ""}Upcoming:\n${next.slice(0, 5).map((task) => `• ${taskLabel(task)}`).join("\n") || "None."}`);
}
async function snoozeTask(text) {
  const minutes = Number(text.match(/\b(\d+)\s*(minute|min|hour|hr)s?\b/i)?.[1] || 10);
  const isHour = /\b(hour|hr)s?\b/i.test(text);
  const reference = text.replace(/^snooze\s+(the\s+)?(task\s+)?/i, "").replace(/\bfor\s+\d+\s*(minute|min|hour|hr)s?\b/i, "").trim();
  const task = findTask(await getTasks(), reference);
  if (!task) return say("I couldn't find that task. Example: snooze submit report for 30 minutes.");
  const snoozedUntil = Date.now() + minutes * (isHour ? 60 : 1) * 60000;
  await updateDoc(doc(db, "users", user.uid, "tasks", task.id), { snoozedUntil, notified: false, warned: false });
  state.lastTask = { ...task, snoozedUntil }; saveState(); await refreshTaskUI();
  say(`Snoozed ${taskLabel(task)} until ${new Date(snoozedUntil).toLocaleTimeString()}.`);
}
function showProfile() {
  say(`Your Karya profile:\n• Name: ${user.displayName || "Not set"}\n• Email: ${user.email || "Not available"}`);
}
async function syncTasks() {
  await refreshTaskUI();
  say("Your Karya task list has been refreshed from Firestore.");
}
async function saveFeedback(text) {
  const feedback = text.replace(/^(send )?(feedback|suggestion)\s*:?/i, "").trim().slice(0, 2000);
  if (!feedback) return say("Tell me the feedback you want to save, for example: feedback: reminders should be easier to see.");
  await addDoc(collection(db, "users", user.uid, "feedback"), { text: feedback, createdAt: new Date().toISOString() });
  say("Thanks — I saved your feedback.");
}
function setFocusMode(text) {
  const enable = !/\b(off|disable|stop|exit)\b/i.test(text);
  state.focusMode = enable; saveState();
  if (enable) window.speechSynthesis?.cancel();
  say(enable ? "Focus mode is on. I’ll keep replies brief and mute AI voice." : "Focus mode is off. Full Karya AI responses are back.");
}
async function setCompletion(text, completed) {
  const task = findTask(await getTasks(), taskReference(text));
  if (!task) return say("I couldn't identify one task. Say, for example: complete submit report.");
  const nextDueDate = completed ? nextRecurringDueDate(task) : null;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", user.uid, "tasks", task.id), { completed, status: completed ? "completed" : "open", notified: false, warned: false, updatedAt: new Date().toISOString() });
  if (nextDueDate) {
    batch.set(doc(collection(db, "users", user.uid, "tasks")), {
      name: task.name, priority: task.priority || "medium", project: task.project || "Inbox", tags: task.tags || [],
      status: "open", description: task.description || "", estimatedMinutes: Number(task.estimatedMinutes || 0),
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map((subtask) => ({ ...subtask, completed: false })) : [],
      recurrence: task.recurrence, dueDate: nextDueDate, completed: false, notified: false, warned: false,
      snoozedUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }
  await batch.commit();
  state.lastTask = { ...task, completed, status: completed ? "completed" : "open" }; saveState(); await refreshTaskUI(); say(`${completed ? "Completed" : "Reopened"} ${taskLabel(task)}.`);
}
async function editTask(text) {
  const tasks = await getTasks();
  const renameInstruction = text.match(/^(?:rename|change)\s+(?:the\s+)?(?:task\s+)?(.+?)\s+(?:to|as|call it)\s+(.+)$/i);
  const task = findTask(tasks, renameInstruction ? renameInstruction[1] : taskReference(text));
  if (!task) return say("I couldn't find that task. Example: change submit report to high priority tomorrow at 5 pm.");
  const updates = {}, priority = priorityFrom(text), dueDate = parseDate(text);
  if (priority) updates.priority = priority; if (dueDate) Object.assign(updates, { dueDate, notified: false, warned: false }); if (renameInstruction) updates.name = renameInstruction[2].trim().slice(0, 240);
  if (!Object.keys(updates).length) return say("Tell me what to change: priority, due date, or a new name.");
  updates.updatedAt = new Date().toISOString();
  await updateDoc(doc(db, "users", user.uid, "tasks", task.id), updates); state.lastTask = { ...task, ...updates }; saveState(); await refreshTaskUI(); say(`Updated ${taskLabel({ ...task, ...updates })}.`);
}
async function deleteTask(text) {
  const task = findTask(await getTasks(), taskReference(text));
  if (!task) return say("I couldn't find that task. Please say: delete followed by the task name.");
  state.pendingConfirmation = { type: "delete", task }; say(`Delete ${taskLabel(task)}? Reply “yes” to confirm or “no” to cancel.`);
}
async function resolveConfirmation(text) {
  if (!state.pendingConfirmation) return false;
  if (/^(no|cancel|stop|don'?t)\b/i.test(text)) { state.pendingConfirmation = null; say("Cancelled. Your task was not changed."); return true; }
  if (!/^(yes|y|confirm|do it|go ahead|okay|ok)\b/i.test(text)) return false;
  const action = state.pendingConfirmation; state.pendingConfirmation = null;
  if (action.type === "delete") { await deleteDoc(doc(db, "users", user.uid, "tasks", action.task.id)); await refreshTaskUI(); say(`Deleted ${taskLabel(action.task)}.`); }
  return true;
}
function setTaskView(text) {
  const sort = document.getElementById("sortSelect"); if (!sort) return say("Task sorting is not available on this page.");
  sort.value = /priority/i.test(text) ? "priority" : /due|date|deadline/i.test(text) ? "due" : /completed|done/i.test(text) ? "completed" : "default";
  sort.dispatchEvent(new Event("change")); say("Updated the task view.");
}
function changeTheme(text) {
  const dark = /dark/i.test(text), light = /light/i.test(text); if (!dark && !light) return say("Say “switch to dark mode” or “switch to light mode”.");
  document.body.classList.toggle("dark", dark); document.body.classList.toggle("light", light); localStorage.setItem("theme", dark ? "dark" : "light");
  const toggle = document.getElementById("themeToggle"); if (toggle) toggle.checked = dark; say(`Switched to ${dark ? "dark" : "light"} theme.`);
}
function help() { say("I work directly with your Karya tasks. Try:\n• Add finish proposal tomorrow at 5 pm, high priority\n• Add standup daily at 9 am project: Work\n• Add gym tomorrow #health project: Personal\n• Show my overdue tasks\n• Complete finish proposal\n• Change finish proposal to low priority\n• Delete finish proposal\n• Analyse my tasks\n• What should I do next?"); }
function appAnswer(text) {
  if (/offline/i.test(text)) return "Enable Offline Task Cache in Settings on a trusted device to keep task data available without internet. Changes sync to Firestore when your connection returns.";
  if (/reminder|notification/i.test(text)) return "Karya checks due tasks while the app is open. Allow browser notifications so it can alert you before a deadline and when a task is overdue.";
  if (/priority|due date|deadline/i.test(text)) return "Every task can have low, medium, or high priority and an optional due date. You can set both in the form or say: add a task tomorrow at 5 pm, high priority.";
  if (/install|pwa|home screen/i.test(text)) return "Karya is installable as a web app when your browser shows its install option. On mobile, use your browser menu's Add to Home Screen option.";
  if (/ai|assistant|voice/i.test(text)) return "Karya AI reads and manages only the signed-in user's Karya tasks. Built-in commands work without a model; Advanced AI asks permission before sending limited context to Gemini.";
  if (/setting|theme|sound|export|analytics/i.test(text)) return "Open Settings from your profile menu to view analytics, export tasks, set the theme colour, choose reminder sounds, or clear your tasks.";
  return "Karya is a task manager with priorities, due dates, reminders, analytics, cloud-synced tasks, and this task-aware assistant.";
}
async function handleMessage(text) {
  if (await resolveConfirmation(text)) return; const lower = text.toLowerCase().trim();
  if (state.pendingGeminiQuestion) {
    if (/^(yes|y|allow|agree)\b/i.test(lower)) {
      const question = state.pendingGeminiQuestion;
      state.pendingGeminiQuestion = null;
      localStorage.setItem(`karya_gemini_consent_${user.uid}`, "allowed");
      return askGemini(question);
    }
    if (/^(no|n|cancel|decline)\b/i.test(lower)) {
      state.pendingGeminiQuestion = null;
      return say("No problem. I will keep your task data in Karya and use only built-in task commands.");
    }
    return say("Reply “yes” to use Advanced AI for your original question, or “no” to cancel.");
  }
  if (/^(help|what can you do|commands)\??$/i.test(lower)) return help();
  if (/\b(focus mode|deep work)\b/i.test(lower)) return setFocusMode(lower);
  if (/\b(show (my )?profile|who am i|my profile)\b/i.test(lower)) return showProfile();
  if (/\b(sync|refresh|reload) (my )?tasks?\b/i.test(lower)) return syncTasks();
  if (/^(send )?(feedback|suggestion)\b/i.test(lower)) return saveFeedback(text);
  if (/\b(what is karya|about karya|how does karya|settings|offline|reminder|notification|export|priority|due date|deadline|install|pwa|home screen|karya ai)\b/i.test(lower)) return say(appAnswer(lower));
  if (/\b(analyse|analyze|summary|statistics|stats|productivity|what should i do|what.?s next|suggest.*task|next task)\b/i.test(lower)) return analyseTasks();
  if (/^snooze\b/i.test(lower)) return snoozeTask(text);
  if (/^(add|create|schedule|plan|remind me to)\b/i.test(lower)) return addTask(text);
  if (/\b(delete|remove|trash)\b/i.test(lower)) return deleteTask(text);
  if (/^(complete|finish|mark|done)\b/i.test(lower) || /\bmark .+ (done|complete)\b/i.test(lower)) return setCompletion(text, true);
  if (/^(reopen|undo|uncomplete)\b/i.test(lower)) return setCompletion(text, false);
  if (/^(edit|update|change|rename)\b/i.test(lower)) return editTask(text);
  if (/\b(sort|filter|reorder)\b/i.test(lower)) return setTaskView(text);
  if (/\b(dark mode|light mode|change theme|switch theme)\b/i.test(lower)) return changeTheme(text);
  if (/\b(show|list|my tasks|tasks due|completed tasks|pending tasks|overdue)\b/i.test(lower)) return listTasks(text);
  if (/\b(hi|hello|hey)\b/i.test(lower)) return say("Hi — I’m ready to manage your Karya tasks. Say “help” for examples.");
  if (currentAction === "smart-add") return addTask(text);
  if (!hasGeminiConsent()) {
    state.pendingGeminiQuestion = text;
    return say("Advanced AI can answer this question using Gemini. It sends a short chat window and up to 12 relevant task summaries to Google. Reply “yes” to continue or “no” to keep this data in Karya.");
  }
  return askGemini(text);
}
async function send() {
  if (processing) return; const text = el.input.value.trim(); if (!text) return; if (!user) return say("Please sign in before using Karya AI.");
  processing = true; el.send.disabled = true; el.input.value = ""; sayUser(text);
  try { await handleMessage(text); } catch (error) { console.error("Karya AI task action failed:", error); say("I couldn't complete that task action. Check your internet connection and try again."); } finally { processing = false; el.send.disabled = false; }
}
function openPanel() { el.panel.classList.add("open"); el.panel.setAttribute("aria-hidden", "false"); if (!el.messages.children.length) say("I’m Karya AI. I can read and manage your actual Karya tasks. What would you like to do?"); el.input.focus(); }
function closePanel() { el.panel.classList.remove("open"); el.panel.setAttribute("aria-hidden", "true"); if (listening && recognition) recognition.stop(); }
function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SpeechRecognition) return say("Voice input is not supported in this browser.");
  if (!recognition) { recognition = new SpeechRecognition(); recognition.lang = "en-US"; recognition.interimResults = false; recognition.onresult = (event) => { el.input.value = event.results[0][0].transcript; send(); }; recognition.onend = () => { listening = false; el.voice.classList.remove("listening"); }; recognition.onerror = () => say("I couldn't hear that. Please try again or type your request."); }
  if (listening) return recognition.stop(); listening = true; el.voice.classList.add("listening"); recognition.start();
}
el.button?.addEventListener("click", openPanel); el.close?.addEventListener("click", closePanel); el.send?.addEventListener("click", send);
el.input?.addEventListener("keydown", (event) => { if (event.key === "Enter") send(); });
el.newChat?.addEventListener("click", () => { el.messages.innerHTML = ""; history = []; localStorage.removeItem(`${HISTORY_KEY}_${user?.uid || "anon"}`); state.pendingConfirmation = null; say("New chat started. What can I do with your tasks?"); });
el.history?.addEventListener("click", () => { const recent = history.slice(-8); system(recent.length ? recent.map((item) => `${item.type === "user" ? "You" : "AI"}: ${item.text}`).join("\n") : "No chat history yet."); });
el.voice?.addEventListener("click", startVoice);
el.speech?.addEventListener("click", () => { speechEnabled = !speechEnabled; localStorage.setItem(aiPreferenceKey("speech"), speechEnabled ? "on" : "off"); el.speech.textContent = speechEnabled ? "🔊" : "🔇"; if (!speechEnabled) window.speechSynthesis?.cancel(); system(`AI voice ${speechEnabled ? "enabled" : "muted"}.`); });
el.actionButtons.forEach((button) => button.addEventListener("click", () => { el.actionButtons.forEach((item) => item.classList.remove("active")); button.classList.add("active"); currentAction = button.dataset.action; if (currentAction === "analyse") analyseTasks().catch(console.error); if (currentAction === "reminders") showReminders().catch(console.error); }));
onAuthStateChanged(auth, (nextUser) => { user = nextUser || null; loadState(); });
