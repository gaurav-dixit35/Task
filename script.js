import { auth, db } from './firebase.js';
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  query
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// DOM Elements
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const prioritySelect = document.getElementById('prioritySelect');
const taskList = document.getElementById('taskList');
const searchInput = document.getElementById('searchInput');
const voiceBtn = document.getElementById('voiceBtn');
const snackbar = document.getElementById('snackbar');
const undoBtn = document.getElementById('undoBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('userInfo');
const themeToggle = document.getElementById('themeToggle');
const dueInput = document.getElementById('dueInput');
const noNotify = document.getElementById('noNotify');
const reminderSound = document.getElementById('reminderSound');
const sortSelect = document.getElementById('sortSelect');
const profile = document.getElementById('profile');
const profileWrapper = document.querySelector('.profile-wrapper');
const profileDropdown = document.getElementById('profileDropdown');
const logoutDropdownBtn = document.getElementById('logoutDropdownBtn');

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

// Auth
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    window.location.href = "login.html";
  } else {
    user = u;
    if (userInfo) userInfo.textContent = user.displayName || user.email;
    if (profile && user.displayName) {
      profile.textContent = user.displayName.charAt(0).toUpperCase();
    }
    await loadTasks();
  }
});

// Logout
logoutDropdownBtn?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// Dropdown
profile?.addEventListener('click', () => {
  profileDropdown.style.display =
    profileDropdown.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', (e) => {
  if (!profileWrapper.contains(e.target)) {
    profileDropdown.style.display = 'none';
  }
});

// Load Tasks
async function loadTasks() {
  tasks = [];
  const q = query(collection(db, "users", user.uid, "tasks"));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    tasks.push({ ...docSnap.data(), id: docSnap.id });
  });
  renderTasks();
}

// Save Task
async function saveTaskToFirestore(task) {
  const docRef = await addDoc(collection(db, "users", user.uid, "tasks"), task);
  task.id = docRef.id;
  tasks.push(task);
  renderTasks();
}

// Update Task
async function updateTaskInFirestore(taskId, updatedFields) {
  await updateDoc(doc(db, "users", user.uid, "tasks", taskId), updatedFields);
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
      return taskCopy.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
    case "priority":
      return taskCopy.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    case "completed":
      return taskCopy.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
    default:
      return taskCopy;
  }
}

// Render Tasks
function renderTasks() {
  taskList.innerHTML = '';
  const searchValue = searchInput.value.toLowerCase();

  getSortedTasks().forEach((task) => {
    if (!task.name.toLowerCase().includes(searchValue)) return;

    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;
    li.innerHTML = `
      <span>${task.name}</span>
      ${task.dueDate ? `<small>🕒 Due: ${new Date(task.dueDate).toLocaleString()}</small>` : ""}
      <span class="task-priority priority-${task.priority}">(${task.priority})</span>
      <div class="buttons">
        <button class="done-btn">✔</button>
        <button class="delete-btn">✖</button>
      </div>
    `;

    li.querySelector(".done-btn").onclick = async () => {
      task.completed = !task.completed;
      await updateTaskInFirestore(task.id, { completed: task.completed });
      renderTasks();
    };

    li.querySelector(".delete-btn").onclick = async () => {
      lastDeleted = { ...task };
      tasks = tasks.filter(t => t.id !== task.id);
      await deleteTaskFromFirestore(task.id);
      renderTasks();
      showUndoSnackbar();
    };

    taskList.appendChild(li);
  });
}

// Add Task
taskForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const taskName = taskInput.value.trim();
  const priority = prioritySelect.value;
  const dueDate = dueInput.value;

  if (taskName !== '') {
    const newTask = {
      name: taskName,
      priority,
      dueDate,
      completed: false,
      notified: false,
      noNotify: noNotify?.checked || false
    };
    await saveTaskToFirestore(newTask);
    taskInput.value = '';
    dueInput.value = '';
    prioritySelect.value = 'low';
    noNotify.checked = false;
  }
});

// Undo Delete
undoBtn?.addEventListener('click', async () => {
  if (lastDeleted && user) {
    await saveTaskToFirestore({ ...lastDeleted });
    snackbar?.classList.remove('show');
    lastDeleted = null;
  }
});

function showUndoSnackbar() {
  snackbar?.classList.add('show');
  setTimeout(() => {
    snackbar?.classList.remove('show');
    lastDeleted = null;
  }, 5000);
}

// Voice Input
voiceBtn?.addEventListener('click', () => {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Speech recognition not supported.');
    return;
  }
  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.start();
  recognition.onresult = (e) => {
    taskInput.value = e.results[0][0].transcript;
  };
});

// Theme Toggle
themeToggle?.addEventListener('change', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

window.addEventListener('load', () => {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    if (themeToggle) themeToggle.checked = true;
  }

  // Ask Notification Permission
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission().then(permission => {
      console.log("🔔 Notification permission:", permission);
    });
  }
});

// 🔔 Due Date Reminder Check
function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = Date.now();
  tasks.forEach(task => {
    if (!task.dueDate || task.notified || task.noNotify) return;

    const taskDue = new Date(task.dueDate).getTime();
    const diff = taskDue - now;

    // Only trigger if due within ±60s
    if (Math.abs(diff) <= 60000) {
      new Notification(`⏰ "${task.name}" is due now!`);
      reminderSound?.play();
      task.notified = true;
      updateTaskInFirestore(task.id, { notified: true });
    }
  });
}


// Rating System
const ratingLabels = {
  1: "😞 Poor", 2: "😐 Fair", 3: "🙂 Good", 4: "😄 Very Good", 5: "🤩 Excellent"
};

starRating?.querySelectorAll("i").forEach(star => {
  star.addEventListener("click", () => {
    selectedRating = parseInt(star.dataset.value);
    updateStarUI();
  });
});

function updateStarUI() {
  starRating?.querySelectorAll("i").forEach(star => {
    star.classList.toggle("selected", parseInt(star.dataset.value) <= selectedRating);
  });
  ratingLabel.textContent = ratingLabels[selectedRating] || "Select a rating";
}

submitRatingBtn?.addEventListener("click", async () => {
  const feedback = feedbackText.value.trim();
  if (!selectedRating || !feedback) return alert("Please rate and give feedback");

  try {
    await addDoc(collection(db, "ratings"), {
      rating: selectedRating,
      feedback,
      timestamp: new Date().toISOString(),
      uid: user.uid,
      name: user.displayName || "Anonymous",
      email: user.email || "N/A"
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
});
closeRateUs?.addEventListener("click", closeRateBox);

// Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("✅ SW Registered"))
    .catch((e) => console.error("SW Error:", e));
}
