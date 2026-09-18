// Pure task helpers shared by the browser UI and automated tests.
// Firestore Timestamp values are supported to keep older task documents safe.
export function toTaskDate(value) {
  if (!value) return null;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateSortValue(value) {
  return toTaskDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

export function formatLocalDateTime(value) {
  const date = toTaskDate(value);
  if (!date) return null;
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function nextRecurringDueDate(task, now = new Date()) {
  const next = toTaskDate(task?.dueDate);
  if (!next || !["daily", "weekly"].includes(task?.recurrence)) return null;
  const interval = task.recurrence === "weekly" ? 7 : 1;
  do next.setDate(next.getDate() + interval);
  while (next <= now);
  return formatLocalDateTime(next);
}

export function normaliseTags(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24))
      .filter(Boolean)
  )].slice(0, 8);
}
