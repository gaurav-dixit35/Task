import { auth, db } from "./firebase.js";
import { dateSortValue, nextRecurringDueDate, normaliseTags, toTaskDate } from "./task-utils.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// DOM Elements
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const projectInput = document.getElementById("projectInput");
const tagsInput = document.getElementById("tagsInput");
const prioritySelect = document.getElementById("prioritySelect");
const repeatSelect = document.getElementById("repeatSelect");
const taskList = document.getElementById("taskList");
const taskDetailsDialog = document.getElementById("taskDetailsDialog");
const taskDetailsForm = document.getElementById("taskDetailsForm");
const taskDetailsTitle = document.getElementById("taskDetailsTitle");
const taskDescriptionInput = document.getElementById("taskDescriptionInput");
const taskEstimateInput = document.getElementById("taskEstimateInput");
const taskRecurrenceSelect = document.getElementById("taskRecurrenceSelect");
const subtaskList = document.getElementById("subtaskList");
const subtaskInput = document.getElementById("subtaskInput");
const addSubtaskBtn = document.getElementById("addSubtaskBtn");
const closeTaskDetails = document.getElementById("closeTaskDetails");
const cancelTaskDetails = document.getElementById("cancelTaskDetails");
const searchInput = document.getElementById("searchInput");
const voiceBtn = document.getElementById("voiceBtn");
const snackbar = document.getElementById("snackbar");
const undoBtn = document.getElementById("undoBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");
const themeToggle = document.getElementById("themeToggle");
const dueInput = document.getElementById("dueInput");
const sortSelect = document.getElementById("sortSelect");
const taskViewSelect = document.getElementById("taskViewSelect");
const projectFilter = document.getElementById("projectFilter");
const openTaskCount = document.getElementById("openTaskCount");
const todayTaskCount = document.getElementById("todayTaskCount");
const completedTaskCount = document.getElementById("completedTaskCount");
sortSelect?.addEventListener("change", renderTasks);
taskViewSelect?.addEventListener("change", renderTasks);
projectFilter?.addEventListener("change", renderTasks);

const profile = document.getElementById("profile");
const profileWrapper = document.querySelector(".profile-wrapper");
const profileDropdown = document.getElementById("profileDropdown");
const logoutDropdownBtn = document.getElementById("logoutDropdownBtn");

// Rate Us elements
const rateContainer = document.getElementById("rateUsContainer");
const rateUsBtn = document.getElementById("rateUsBtn");
const closeRateUs = document.getElementById("closeRateUs");
const submitRatingBtn = document.getElementById("submitRatingBtn");
const starRating = document.getElementById("starRating");
const ratingLabel = document.getElementById("ratingLabel");
const feedbackText = document.getElementById("feedbackText");

let user = null;
let tasks = [];
let lastDeleted = null;
let selectedRating = 0;
let unsubscribeTasks = null;
let detailTaskId = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createSubtaskId() {
  return globalThis.crypto?.randomUUID?.() || `subtask-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recurringTaskFrom(task, dueDate) {
  return {
    name: task.name,
    priority: task.priority || "medium",
    project: task.project || "Inbox",
    tags: Array.isArray(task.tags) ? task.tags : [],
    status: "open",
    description: task.description || "",
    estimatedMinutes: Number(task.estimatedMinutes || 0),
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map((subtask) => ({ ...subtask, completed: false }))
      : [],
    recurrence: task.recurrence,
    dueDate,
    completed: false,
    notified: false,
    snoozedUntil: null,
    warned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// Auth
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    unsubscribeTasks?.();
    unsubscribeTasks = null;
    tasks = [];
    window.location.href = "login.html";
  } else {
    user = u;
    if (userInfo) userInfo.textContent = user.displayName || user.email;
    if (profile && user.displayName) {
      profile.textContent = user.displayName.charAt(0).toUpperCase();
    }
    startTaskSync();
  }
});

// Logout
logoutDropdownBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// Dropdown
profile?.addEventListener("click", () => {
  const isOpen = profileDropdown.style.display !== "block";
  profileDropdown.style.display = isOpen ? "block" : "none";
  profile.setAttribute("aria-expanded", String(isOpen));
});
document.addEventListener("click", (e) => {
  if (profileWrapper && !profileWrapper.contains(e.target)) {
    profileDropdown.style.display = "none";
    profile?.setAttribute("aria-expanded", "false");
  }
});

// Load tasks once and keep the visual list synchronized with Firestore changes
// made by the form, Karya AI, or another signed-in device.
async function loadTasks() {
  if (!user) return;
  tasks = [];
  const q = query(collection(db, "users", user.uid, "tasks"));
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    tasks.push({ ...docSnap.data(), id: docSnap.id });
  });
  renderTasks();
}

function startTaskSync() {
  unsubscribeTasks?.();
  const tasksQuery = query(collection(db, "users", user.uid, "tasks"));
  unsubscribeTasks = onSnapshot(
    tasksQuery,
    (snap) => {
      tasks = snap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
      refreshProjectFilter();
      renderTasks();
      if (detailTaskId) {
        if (currentDetailTask()) renderSubtasks();
        else closeTaskDetailsDialog();
      }
    },
    (error) => console.error("Task sync failed:", error)
  );
}

function refreshProjectFilter() {
  if (!projectFilter) return;
  const selected = projectFilter.value;
  const projects = [...new Set(tasks.map((task) => task.project || "Inbox"))].sort((a, b) =>
    a.localeCompare(b)
  );
  projectFilter.innerHTML = '<option value="all">All projects</option>';
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project;
    option.textContent = project;
    projectFilter.appendChild(option);
  });
  projectFilter.value = projects.includes(selected) ? selected : "all";
}

// Save Task
async function saveTaskToFirestore(task) {
  const docRef = await addDoc(collection(db, "users", user.uid, "tasks"), task);
  return docRef.id;
}

// Update Task
async function updateTaskInFirestore(taskId, updatedFields) {
  await updateDoc(doc(db, "users", user.uid, "tasks", taskId), {
    ...updatedFields,
    updatedAt: serverTimestamp(),
  });
}

async function setTaskCompletion(task, completed) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", user.uid, "tasks", task.id), {
    completed,
    status: completed ? "completed" : "open",
    notified: false,
    warned: false,
    updatedAt: serverTimestamp(),
  });
  const nextDueDate = completed ? nextRecurringDueDate(task) : null;
  if (nextDueDate) {
    batch.set(
      doc(collection(db, "users", user.uid, "tasks")),
      recurringTaskFrom(task, nextDueDate)
    );
  }
  await batch.commit();
}

// Delete Task
async function deleteTaskFromFirestore(taskId) {
  await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));
}

// Sort Logic
function getSortedTasks() {
  const method = sortSelect?.value || "default";
  const taskCopy = [...tasks];
  const priorityOrder = { high: 1, medium: 2, low: 3 };

  switch (method) {
    case "due":
      return taskCopy.sort((a, b) => dateSortValue(a.dueDate) - dateSortValue(b.dueDate));
    case "priority":
      return taskCopy.sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
      );
    case "completed":
      return taskCopy.sort((a, b) =>
        a.completed === b.completed ? 0 : a.completed ? 1 : -1
      );
    default:
      return taskCopy;
  }
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  document.body.classList.remove("light");
  if (themeToggle) themeToggle.checked = isDark;
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

function renderTaskOverview() {
  const today = new Date().toDateString();
  const open = tasks.filter((task) => !task.completed);
  if (openTaskCount) openTaskCount.textContent = open.length;
  if (todayTaskCount) {
    todayTaskCount.textContent = open.filter(
      (task) => toTaskDate(task.dueDate)?.toDateString() === today
    ).length;
  }
  if (completedTaskCount) completedTaskCount.textContent = tasks.length - open.length;
}

// Render Tasks
function renderTasks() {
  taskList.innerHTML = "";
  renderTaskOverview();
  const searchValue = searchInput.value.toLowerCase().replace(/^#/, "");
  const activeView = taskViewSelect?.value || "all";
  const activeProject = projectFilter?.value || "all";
  const now = new Date();
  const today = now.toDateString();

  const visibleTasks = getSortedTasks().filter((task) => {
    const searchable = [task.name, task.project, ...(task.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!searchable.includes(searchValue)) return false;
    if (activeProject !== "all" && (task.project || "Inbox") !== activeProject) return false;
    if (activeView === "open" && task.completed) return false;
    if (activeView === "completed" && !task.completed) return false;
    const dueDate = toTaskDate(task.dueDate);
    if (activeView === "today" && dueDate?.toDateString() !== today) return false;
    if (activeView === "overdue" && (task.completed || !dueDate || dueDate >= now)) return false;
    return true;
  });

  if (!visibleTasks.length) {
    taskList.innerHTML = '<li class="empty-state">No tasks match this view.</li>';
    return;
  }

  visibleTasks.forEach((task) => {

    const li = document.createElement("li");
    li.className = `task-item ${task.completed ? "completed" : ""}`;
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
    li.innerHTML = `
      <div class="task-content">
        <div class="task-title-row">
          <span class="task-title">${escapeHtml(task.name)}</span>
          <span class="task-priority priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
        </div>
        <div class="task-meta">
          ${toTaskDate(task.dueDate) ? `<small>🕒 ${escapeHtml(toTaskDate(task.dueDate).toLocaleString())}</small>` : '<small class="no-due-date">No deadline</small>'}
          <small class="task-project">📁 ${escapeHtml(task.project || "Inbox")}</small>
          ${(task.tags || []).map((tag) => `<small class="task-tag">#${escapeHtml(tag)}</small>`).join("")}
          ${task.recurrence && task.recurrence !== "none" ? `<small class="task-repeat">↻ ${escapeHtml(task.recurrence)}</small>` : ""}
          ${subtasks.length ? `<small class="task-subtasks">☑ ${completedSubtasks}/${subtasks.length} subtasks</small>` : ""}
        </div>
      </div>
      <div class="buttons" aria-label="Task actions">
        <button class="done-btn" aria-label="${task.completed ? "Reopen" : "Complete"} ${escapeHtml(task.name)}">${task.completed ? "↺" : "✓"}</button>
        <button class="details-btn" aria-label="Open details for ${escapeHtml(task.name)}">⋯</button>
        <button class="delete-btn" aria-label="Delete ${escapeHtml(task.name)}">✕</button>
      </div>
    `;

    li.querySelector(".done-btn").onclick = async (event) => {
      const doneButton = event.currentTarget;
      doneButton.disabled = true;
      try {
        await setTaskCompletion(task, !task.completed);
      } catch (error) {
        console.error("Task update failed:", error);
        alert("Couldn't update this task. Please try again.");
      } finally {
        doneButton.disabled = false;
      }
    };

    li.querySelector(".delete-btn").onclick = async () => {
      try {
        lastDeleted = { ...task };
        await deleteTaskFromFirestore(task.id);
        showUndoSnackbar();
      } catch (error) {
        console.error("Task deletion failed:", error);
        alert("Couldn't delete this task. Please try again.");
      }
    };

    li.querySelector(".details-btn").onclick = () => openTaskDetails(task);

    taskList.appendChild(li);
  });
}
// Real-time Search Filter
searchInput?.addEventListener("input", renderTasks);

// Add Task
taskForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const taskName = taskInput.value.trim();
  const priority = prioritySelect.value;
  const recurrence = repeatSelect?.value || "none";
  const dueDate = dueInput.value;
  const project = projectInput?.value.trim().slice(0, 40) || "Inbox";
  const tags = normaliseTags(tagsInput?.value);

  if (taskName !== "") {
    if (recurrence !== "none" && !dueDate) {
      alert("Choose a due date for a repeating task.");
      return;
    }
    if (dueDate && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const newTask = {
      name: taskName,
      priority,
      project,
      tags,
      status: "open",
      description: "",
      estimatedMinutes: 0,
      subtasks: [],
      recurrence,
      dueDate: dueDate || null,
      completed: false,
      notified: false,
      snoozedUntil: null, // 🆕 Phase 5
      warned: false, // 🆕 Phase 5 (early reminder)
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await saveTaskToFirestore(newTask);
      taskInput.value = "";
      dueInput.value = "";
      if (projectInput) projectInput.value = "";
      if (tagsInput) tagsInput.value = "";
      prioritySelect.value = "low";
      if (repeatSelect) repeatSelect.value = "none";
    } catch (error) {
      console.error("Task creation failed:", error);
      alert("Couldn't add this task. Check your connection and try again.");
    }
  }
});

function currentDetailTask() {
  return tasks.find((task) => task.id === detailTaskId) || null;
}

function renderSubtasks() {
  if (!subtaskList) return;
  const task = currentDetailTask();
  const subtasks = task?.subtasks || [];
  subtaskList.innerHTML = "";
  if (!subtasks.length) {
    subtaskList.innerHTML = '<li class="empty-subtasks">No subtasks yet.</li>';
    return;
  }
  subtasks.forEach((subtask) => {
    const item = document.createElement("li");
    item.className = "subtask-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(subtask.completed);
    checkbox.setAttribute("aria-label", `Complete ${subtask.title}`);
    checkbox.addEventListener("change", async () => {
      const nextSubtasks = subtasks.map((itemToUpdate) =>
        itemToUpdate.id === subtask.id
          ? { ...itemToUpdate, completed: checkbox.checked }
          : itemToUpdate
      );
      try {
        await updateTaskInFirestore(task.id, { subtasks: nextSubtasks });
      } catch (error) {
        console.error("Subtask update failed:", error);
        checkbox.checked = !checkbox.checked;
        alert("Couldn't update this subtask. Please try again.");
      }
    });
    const label = document.createElement("span");
    label.textContent = subtask.title;
    label.classList.toggle("completed", Boolean(subtask.completed));
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-subtask-btn";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${subtask.title}`);
    removeButton.addEventListener("click", async () => {
      try {
        await updateTaskInFirestore(task.id, {
          subtasks: subtasks.filter((itemToRemove) => itemToRemove.id !== subtask.id),
        });
      } catch (error) {
        console.error("Subtask removal failed:", error);
        alert("Couldn't remove this subtask. Please try again.");
      }
    });
    item.append(checkbox, label, removeButton);
    subtaskList.appendChild(item);
  });
}

function openTaskDetails(task) {
  if (!taskDetailsDialog) return;
  detailTaskId = task.id;
  taskDetailsTitle.textContent = task.name;
  taskDescriptionInput.value = task.description || "";
  taskEstimateInput.value = Number(task.estimatedMinutes || 0) || "";
  taskRecurrenceSelect.value = ["daily", "weekly"].includes(task.recurrence) ? task.recurrence : "none";
  subtaskInput.value = "";
  renderSubtasks();
  if (!taskDetailsDialog.open) taskDetailsDialog.showModal();
}

function closeTaskDetailsDialog() {
  detailTaskId = null;
  if (taskDetailsDialog?.open) taskDetailsDialog.close();
}

taskDetailsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = currentDetailTask();
  if (!task) return closeTaskDetailsDialog();
  const estimatedMinutes = Number(taskEstimateInput.value || 0);
  const recurrence = taskRecurrenceSelect.value;
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 0 || estimatedMinutes > 1440) {
    return alert("Enter an estimate between 0 and 1440 minutes.");
  }
  if (recurrence !== "none" && !task.dueDate) {
    return alert("Set a due date before making this task repeat.");
  }
  try {
    await updateTaskInFirestore(task.id, {
      description: taskDescriptionInput.value.trim(),
      estimatedMinutes,
      recurrence,
    });
    closeTaskDetailsDialog();
  } catch (error) {
    console.error("Task detail save failed:", error);
    alert("Couldn't save task details. Please try again.");
  }
});

addSubtaskBtn?.addEventListener("click", async () => {
  const task = currentDetailTask();
  const title = subtaskInput.value.trim();
  if (!task || !title) return;
  const subtasks = task.subtasks || [];
  if (subtasks.length >= 50) return alert("A task can have up to 50 subtasks.");
  try {
    await updateTaskInFirestore(task.id, {
      subtasks: [...subtasks, { id: createSubtaskId(), title: title.slice(0, 240), completed: false }],
    });
    subtaskInput.value = "";
  } catch (error) {
    console.error("Subtask creation failed:", error);
    alert("Couldn't add this subtask. Please try again.");
  }
});

subtaskInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSubtaskBtn?.click();
  }
});

closeTaskDetails?.addEventListener("click", closeTaskDetailsDialog);
cancelTaskDetails?.addEventListener("click", closeTaskDetailsDialog);
taskDetailsDialog?.addEventListener("close", () => {
  detailTaskId = null;
});

// Undo Delete
undoBtn?.addEventListener("click", async () => {
  if (lastDeleted && user) {
    try {
      const { id, ...taskToRestore } = lastDeleted;
      await saveTaskToFirestore(taskToRestore);
      snackbar?.classList.remove("show");
      lastDeleted = null;
    } catch (error) {
      console.error("Task restore failed:", error);
      alert("Couldn't restore this task. Please try again.");
    }
  }
});

function showUndoSnackbar() {
  snackbar?.classList.add("show");
  setTimeout(() => {
    snackbar?.classList.remove("show");
    lastDeleted = null;
  }, 5000);
}

// Voice Input
voiceBtn?.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition not supported.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.start();
  recognition.onresult = (e) => {
    taskInput.value = e.results[0][0].transcript;
  };
});

// Theme Toggle
themeToggle?.addEventListener("change", () => {
  applyTheme(themeToggle.checked ? "dark" : "light");
});

window.addEventListener("load", () => {
  applyTheme(localStorage.getItem("theme") === "dark" ? "dark" : "light");
});

// Rating System
const ratingLabels = {
  1: "😞 Poor",
  2: "😐 Fair",
  3: "🙂 Good",
  4: "😄 Very Good",
  5: "🤩 Excellent",
};

starRating?.querySelectorAll("i").forEach((star) => {
  star.addEventListener("click", () => {
    selectedRating = parseInt(star.dataset.value);
    updateStarUI();
  });
});

function updateStarUI() {
  starRating?.querySelectorAll("i").forEach((star) => {
    star.classList.toggle(
      "selected",
      parseInt(star.dataset.value) <= selectedRating
    );
  });
  ratingLabel.textContent = ratingLabels[selectedRating] || "Select a rating";
}

submitRatingBtn?.addEventListener("click", async () => {
  const feedback = feedbackText.value.trim();
  if (!selectedRating || !feedback)
    return alert("Please rate and give feedback");

  try {
    await addDoc(collection(db, "ratings"), {
      rating: selectedRating,
      feedback,
      timestamp: new Date().toISOString(),
      uid: user.uid,
      name: user.displayName || "Anonymous",
      email: user.email || "N/A",
    });
    alert("Thank you for your feedback!");
    closeRateBox();
  } catch (e) {
    console.error("Failed to save rating:", e);
    alert("Couldn't save rating.");
  }
});

function closeRateBox() {
  rateContainer.style.display = "none";
  selectedRating = 0;
  feedbackText.value = "";
  updateStarUI();
}

rateUsBtn?.addEventListener("click", () => {
  rateContainer.style.display = "flex";
  profileDropdown.style.display = "none";
  profile?.setAttribute("aria-expanded", "false");
});
rateUsBtn?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    rateUsBtn.click();
  }
});
closeRateUs?.addEventListener("click", closeRateBox);

// Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then(() => console.log("✅ SW Registered"))
    .catch((e) => console.error("SW Error:", e));
}
//  Run Reminder Check Every Minute
setInterval(() => checkDueReminders().catch((error) => console.error("Reminder check failed:", error)), 60000);
checkDueReminders().catch((error) => console.error("Reminder check failed:", error));

//  Updated Reminder Check with LocalStorage Sound Selection
async function checkDueReminders() {
  if (!("Notification" in window)) return;

  if (Notification.permission !== "granted") {
    return;
  }

  const now = Date.now();

  for (const task of tasks) {
    if (!task.dueDate || task.completed) continue;

    const due = toTaskDate(task.dueDate)?.getTime();
    if (!due) continue;

    //  Snoozed
    if (task.snoozedUntil && now < task.snoozedUntil) continue;

    const diff = due - now;

    /* ---------- EARLY WARNING (10 min before) ---------- */
    if (diff <= 10 * 60000 && diff > 0 && !task.warned) {
      sendNotification(
        `⏳ Coming up soon`,
        `"${task.name}" is due in 10 minutes`
      );

      try {
        await updateTaskInFirestore(task.id, { warned: true });
        playSound();
      } catch (error) {
        console.error("Reminder warning update failed:", error);
      }
      continue;
    }

    /* ---------- DUE NOW ---------- */
    if (Math.abs(diff) <= 60000 && !task.notified) {
      sendNotification(
        `⏰ Task Due Now`,
        `"${task.name}" needs your attention`
      );

      try {
        await updateTaskInFirestore(task.id, { notified: true });
        playSound();
      } catch (error) {
        console.error("Due reminder update failed:", error);
      }
      continue;
    }

    /* ---------- MISSED TASK ---------- */
    if (diff < -10 * 60000 && !task.notified) {
      sendNotification(`⚠️ Missed Task`, `"${task.name}" is overdue`);

      try {
        await updateTaskInFirestore(task.id, { notified: true });
        playSound();
      } catch (error) {
        console.error("Overdue reminder update failed:", error);
      }
    }
  }
}
function sendNotification(title, body) {
  new Notification(title, { body });
}

function playSound() {
  const allowed = ["default", "ding", "bell"];
  let sound = localStorage.getItem("notificationSound") || "default";
  if (!allowed.includes(sound)) sound = "default";

  const audio = new Audio(`sounds/${sound}.mp3`);
  audio.play().catch(() => {});
}
async function snoozeTask(task, minutes = 10) {
  const snoozeUntil = Date.now() + minutes * 60000;
  task.snoozedUntil = snoozeUntil;

  await updateTaskInFirestore(task.id, {
    snoozedUntil,
    notified: false,
    warned: false,
  });
}
// === Karya AI hooks ===

// Called from ai.js to reload tasks from Firestore
window.loadTasksFromFirestore = async function () {
  if (!user) return;
  await loadTasks();
};

// Apply saved primary color on home
window.addEventListener("load", () => {
  const color = localStorage.getItem("customColor");
  if (color) {
    document.documentElement.style.setProperty("--primary-color", color);
  }
});
