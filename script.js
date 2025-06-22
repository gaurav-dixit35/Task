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

// Ask for notification permission on load
if ('Notification' in window && Notification.permission !== 'granted') {
  Notification.requestPermission();
}

// DOM elements
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
const settingsBtn = document.getElementById('settingsBtn');

let user = null;
let tasks = [];
let lastDeleted = null;

// Auth state
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    window.location.href = "login.html";
  } else {
    user = u;
    if (logoutBtn) logoutBtn.style.display = "inline-block";
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
profile?.addEventListener('click', () => {
  profileDropdown.style.display =
    profileDropdown.style.display === 'block' ? 'none' : 'block';
});

// Optional: close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!profileWrapper.contains(e.target)) {
    profileDropdown.style.display = 'none';
  }
});
settingsBtn?.addEventListener('click', () => {
  alert("Settings feature coming soon!");
});


// Load tasks
async function loadTasks() {
  tasks = [];
  const q = query(collection(db, "users", user.uid, "tasks"));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    tasks.push({ ...docSnap.data(), id: docSnap.id });
  });
  renderTasks();
}

// Save task
async function saveTaskToFirestore(task) {
  const docRef = await addDoc(collection(db, "users", user.uid, "tasks"), task);
  task.id = docRef.id;
  tasks.push(task);
  renderTasks();
}

// Update task
async function updateTaskInFirestore(taskId, updatedFields) {
  await updateDoc(doc(db, "users", user.uid, "tasks", taskId), updatedFields);
}

// Delete task
async function deleteTaskFromFirestore(taskId) {
  await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));
}
function getSortedTasks() {
  const method = sortSelect.value;
  const taskCopy = [...tasks];

  switch (method) {
    case "due":
      return taskCopy.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
    case "priority":
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      return taskCopy.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    case "completed":
      return taskCopy.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
    default:
      return taskCopy;
  }
}

// Render task list
function renderTasks() {
  taskList.innerHTML = '';
  const searchValue = searchInput.value.toLowerCase();

  getSortedTasks().forEach((task) => {
    if (!task.name.toLowerCase().includes(searchValue)) return;

    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;

    const taskText = document.createElement('span');
    taskText.textContent = task.name;
    li.appendChild(taskText);

    if (task.dueDate) {
      const due = document.createElement('small');
      due.textContent = `🕒 Due: ${new Date(task.dueDate).toLocaleString()}`;
      due.style.display = 'block';
      due.style.fontSize = '12px';
      due.style.color = '#999';
      li.appendChild(due);
    }

    const prioritySpan = document.createElement('span');
    prioritySpan.className = `task-priority priority-${task.priority}`;
    prioritySpan.textContent = `(${task.priority})`;

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';

    const doneBtn = document.createElement('button');
    doneBtn.textContent = '✔';
    doneBtn.className = 'done-btn';
    doneBtn.onclick = async () => {
      task.completed = !task.completed;
      await updateTaskInFirestore(task.id, { completed: task.completed });
      renderTasks();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✖';
    deleteBtn.onclick = async () => {
      lastDeleted = { ...task };
      tasks = tasks.filter(t => t.id !== task.id);
      await deleteTaskFromFirestore(task.id);
      renderTasks();
      showUndoSnackbar();
    };

    buttonsDiv.appendChild(doneBtn);
    buttonsDiv.appendChild(deleteBtn);

    li.appendChild(prioritySpan);
    li.appendChild(buttonsDiv);
    taskList.appendChild(li);
  });
}

// Add task
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

    taskInput.value = '';
    prioritySelect.value = 'low';
    dueInput.value = '';
    noNotify.checked = false;
    await saveTaskToFirestore(newTask);
  }
});

// Undo
undoBtn?.addEventListener('click', async () => {
  if (lastDeleted && user) {
    await saveTaskToFirestore({
      name: lastDeleted.name,
      priority: lastDeleted.priority,
      dueDate: lastDeleted.dueDate || '',
      completed: lastDeleted.completed,
      notified: lastDeleted.notified || false,
      noNotify: lastDeleted.noNotify || false
    });
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

// Voice input
voiceBtn?.addEventListener('click', () => {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Speech recognition not supported in your browser.');
    return;
  }
  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.start();
  recognition.onresult = (e) => {
    const spoken = e.results[0][0].transcript;
    taskInput.value = spoken;
  };
});

// Dark mode
themeToggle?.addEventListener('change', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// Load theme
window.addEventListener('load', () => {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    if (themeToggle) themeToggle.checked = true;
  }
});
searchInput?.addEventListener('input', renderTasks);

// 🔔 Reminder checker
function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date().getTime();

  tasks.forEach(task => {
    if (!task.dueDate || task.notified || task.noNotify) return;

    const taskDue = new Date(task.dueDate).getTime();

    if (Math.abs(now - taskDue) <= 60000) {
      new Notification(`⏰ Reminder: "${task.name}" is due now!`);
      reminderSound?.play();
      task.notified = true;
      updateTaskInFirestore(task.id, { notified: true });
    }
  });
}
sortSelect?.addEventListener('change', renderTasks);

setInterval(checkDueReminders, 30000);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then(() => console.log("✅ Service Worker Registered"))
    .catch((error) => console.error("SW Error:", error));
}
