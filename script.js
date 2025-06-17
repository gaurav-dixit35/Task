// Load tasks from localStorage
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

// Get DOM elements
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const prioritySelect = document.getElementById('prioritySelect');
const taskList = document.getElementById('taskList');
const themeToggle = document.getElementById('themeToggle');
const searchInput = document.getElementById('searchInput');
const voiceBtn = document.getElementById('voiceBtn');
const snackbar = document.getElementById('snackbar');
const undoBtn = document.getElementById('undoBtn');

let lastDeletedTask = null;
let lastDeletedIndex = null;
let undoTimeout = null;

// Save tasks to localStorage
function saveTasks() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Render tasks
function renderTasks() {
  taskList.innerHTML = '';
  const searchValue = searchInput.value.toLowerCase();

  tasks.forEach((task, index) => {
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
    doneBtn.onclick = () => {
      task.completed = !task.completed;
      saveTasks();
      renderTasks();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✖';
    deleteBtn.onclick = () => {
      const deleted = tasks.splice(index, 1)[0];
      saveTasks();
      renderTasks();
      showUndoSnackbar(deleted, index);
    };

    buttonsDiv.appendChild(doneBtn);
    buttonsDiv.appendChild(deleteBtn);

    li.appendChild(taskText);
    li.appendChild(prioritySpan);
    li.appendChild(buttonsDiv);
    taskList.appendChild(li);
  });
}

// Handle form submission
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const taskName = taskInput.value.trim();
  const priority = prioritySelect.value;

  if (taskName !== '') {
    tasks.push({ name: taskName, completed: false, priority });
    taskInput.value = '';
    prioritySelect.value = 'low';
    saveTasks();
    renderTasks();
  }
});

// Theme toggle
themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// Apply saved theme and render on load
window.addEventListener('load', () => {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    themeToggle.checked = true;
  }
  renderTasks();
});

// Search tasks live
searchInput.addEventListener('input', renderTasks);

// Voice input
voiceBtn.addEventListener('click', () => {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Sorry, your browser does not support speech recognition.');
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognition.start();

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript.trim();
    if (spokenText) {
      taskInput.value = spokenText;
    }
  };

  recognition.onerror = (event) => {
    alert('Voice error: ' + event.error);
  };
});

// Undo logic
function showUndoSnackbar(task, index) {
  lastDeletedTask = task;
  lastDeletedIndex = index;

  snackbar.classList.add('show');

  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    snackbar.classList.remove('show');
    lastDeletedTask = null;
  }, 5000);
}

undoBtn.addEventListener('click', () => {
  if (lastDeletedTask !== null) {
    tasks.splice(lastDeletedIndex, 0, lastDeletedTask);
    saveTasks();
    renderTasks();
    snackbar.classList.remove('show');
    lastDeletedTask = null;
  }
});
