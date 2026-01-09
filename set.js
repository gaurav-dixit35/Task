import { auth, db } from "./firebase.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const clearTasksBtn = document.getElementById("clearTasksBtn");
const loadAnalyticsBtn = document.getElementById("loadAnalyticsBtn");
const analyticsOutput = document.getElementById("analyticsOutput");
const exportJSONBtn = document.getElementById("exportJSON");
const exportCSVBtn = document.getElementById("exportCSV");
const clearExportBtn = document.getElementById("clearExport");
const themeColorPicker = document.getElementById("themeColorPicker");
const themeToggle = document.getElementById("themeToggle");

const infoToggle = document.getElementById("infoToggle");
const infoDropdown = document.getElementById("infoDropdown");
const aboutContainer = document.getElementById("aboutContainer");
const termsContainer = document.getElementById("termsContainer");
const contactContainer = document.getElementById("contactContainer");

const aboutOption = document.getElementById("aboutOption");
const termsOption = document.getElementById("termsOption");
const contactOption = document.getElementById("contactOption");

// Install Elements
const installBtn = document.getElementById("installBtn");
const installContainer = document.getElementById("installContainer");
const confirmInstallBtn = document.getElementById("confirmInstallBtn");
const installSuccess = document.getElementById("installSuccess");

let user = null;
let tasks = [];
let tasksChart = null;

onAuthStateChanged(auth, async (u) => {
  if (!u) {
    window.location.href = "login.html";
  } else {
    user = u;
    await fetchTasks();
  }
});

async function fetchTasks() {
  tasks = [];
  const q = collection(db, "users", user.uid, "tasks");
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    tasks.push({ ...docSnap.data(), id: docSnap.id });
  });
}

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

clearTasksBtn?.addEventListener("click", async () => {
  if (confirm("Are you sure you want to delete ALL your tasks?")) {
    for (const task of tasks) {
      await deleteDoc(doc(db, "users", user.uid, "tasks", task.id));
    }
    alert("All tasks deleted.");
    await fetchTasks();
  }
});

loadAnalyticsBtn?.addEventListener("click", () => {
  const stats = {};
  tasks.forEach((task) => {
    const date = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString()
      : "No Due Date";
    if (!stats[date]) stats[date] = { completed: 0, pending: 0 };
    task.completed ? stats[date].completed++ : stats[date].pending++;
  });

  let output = "";
  for (const date in stats) {
    output += `📅 ${date} — ✅ ${stats[date].completed} | 🕒 ${stats[date].pending}\n`;
  }
  analyticsOutput.textContent = output || "No tasks found.";
  renderTasksChart(stats);
});
function renderTasksChart(stats) {
  const labels = Object.keys(stats);
  const completedData = labels.map((d) => stats[d].completed);
  const pendingData = labels.map((d) => stats[d].pending);

  const canvas = document.getElementById("tasksChart");
  if (!canvas) return;

  if (tasksChart) tasksChart.destroy();

  tasksChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Completed",
          data: completedData,
          backgroundColor: "#22c55e",
        },
        {
          label: "Pending",
          data: pendingData,
          backgroundColor: "#f97316",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

exportJSONBtn?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  downloadFile(url, "tasks.json");
});

exportCSVBtn?.addEventListener("click", () => {
  const headers = ["Name", "Priority", "Due Date", "Completed"];
  const rows = tasks.map((t) => [
    t.name,
    t.priority,
    t.dueDate || "N/A",
    t.completed ? "Yes" : "No",
  ]);
  const csv = [headers, ...rows].map((e) => e.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  downloadFile(url, "tasks.csv");
});

clearExportBtn?.addEventListener("click", () => {
  analyticsOutput.textContent = "";
});

function downloadFile(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

themeColorPicker?.addEventListener("input", (e) => {
  const color = e.target.value;
  document.documentElement.style.setProperty("--primary-color", color);
  localStorage.setItem("customColor", color);
});

window.addEventListener("load", () => {
  const color = localStorage.getItem("customColor");
  if (color) {
    document.documentElement.style.setProperty("--primary-color", color);
    themeColorPicker.value = color;
  }

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    if (themeToggle) themeToggle.checked = true;
  }
});

themeToggle?.addEventListener("change", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
});
const soundSelect = document.getElementById("soundSelect");
window.addEventListener("load", () => {
  const savedSound = localStorage.getItem("notificationSound") || "default";
  if (soundSelect) soundSelect.value = savedSound;
});

document.getElementById("previewSound")?.addEventListener("click", () => {
  const selected = document.getElementById("soundSelect").value;
  const audio = new Audio(`sounds/${selected}.mp3`);
  audio.play();
});
document.getElementById("soundSelect")?.addEventListener("change", () => {
  const selected = document.getElementById("soundSelect").value;
  localStorage.setItem("notificationSound", selected);
});

infoToggle?.addEventListener("click", () => {
  infoDropdown.style.display =
    infoDropdown.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", (e) => {
  if (!infoToggle.contains(e.target) && !infoDropdown.contains(e.target)) {
    infoDropdown.style.display = "none";
  }
});

function showSection(section) {
  [aboutContainer, termsContainer, contactContainer, installContainer].forEach(
    (c) => c && (c.style.display = "none")
  );
  section.style.display = "block";
  infoDropdown.style.display = "none";
}

aboutOption?.addEventListener("click", () => showSection(aboutContainer));
termsOption?.addEventListener("click", () => showSection(termsContainer));
contactOption?.addEventListener("click", () => showSection(contactContainer));

let deferredPrompt;

installBtn.style.display = "none";

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  installBtn.style.display = "block";
});

installBtn.addEventListener("click", () => {
  installContainer.style.display = "block";
});

confirmInstallBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    installSuccess.style.display = "block";
    installBtn.style.display = "none";
  }

  deferredPrompt = null;
});
