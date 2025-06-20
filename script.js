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

// DOM
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

let user = null;
let tasks = [];
let lastDeleted = null;

// Auth state check
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    window.location.href = "login.html";
  } else {
    user = u;
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (userInfo) userInfo.textContent = `Logged in as ${user.displayName}`;
    await loadTasks();
  }
});

// Logout
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "login.html";
  };
}

// Firestore ops
async function loadTasks() {
  tasks = [];
  const q = query(collection(db, "users", user.uid, "tasks"));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    tasks.push({ ...docSnap.data(), id: docSnap.id });
  });
  renderTasks();
}

async function saveTaskToFirestore(task) {
  const docRef = await addDoc(collection(db, "users", user.uid, "tasks"), task);
  task.id = docRef.id;
  tasks.push(task);
  renderTasks();
}

async function updateTaskInFirestore(taskId, updatedFields) {
  await updateDoc(doc(db, "users", user.uid, "tasks", taskId), updatedFields);
}

async function deleteTaskFromFirestore(taskId) {
  await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));
}

// Render
function renderTasks() {
  taskList.innerHTML = '';
  const searchValue = searchInput.value.toLowerCase();

  tasks.forEach((task) => {
    if (!task.name.toLowerCase().includes(searchValue)) return;

    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;

    const taskText = document.createElement('span');
    taskText.textContent = task.name;

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

    li.appendChild(taskText);
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
  if (taskName !== '') {
    const newTask = { name: taskName, priority, completed: false };
    taskInput.value = '';
    prioritySelect.value = 'low';
    await saveTaskToFirestore(newTask);
  }
});

// Undo delete
undoBtn?.addEventListener('click', async () => {
  if (lastDeleted && user) {
    await saveTaskToFirestore({
      name: lastDeleted.name,
      priority: lastDeleted.priority,
      completed: lastDeleted.completed
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

// Voice Input
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

// Dark Mode
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
