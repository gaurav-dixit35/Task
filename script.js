// Load tasks from localStorage
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

// Get DOM elements
const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');

// Save tasks to localStorage
function saveTasks() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Render tasks
function renderTasks() {
  taskList.innerHTML = '';
  
  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;
    
    const taskText = document.createElement('span');
    taskText.textContent = task.name;
    li.appendChild(taskText);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => {
      tasks.splice(index, 1);
      saveTasks();
      renderTasks();
    };
    
    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Mark as Done';
    doneBtn.className = 'done-btn';
    doneBtn.onclick = () => {
      task.completed = !task.completed;
      saveTasks();
      renderTasks();
    };
    
    li.appendChild(doneBtn);
    li.appendChild(deleteBtn);
    taskList.appendChild(li);
  });
}

// Handle form submission
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const taskName = taskInput.value.trim();
  
  if (taskName !== '') {
    tasks.push({ name: taskName, completed: false });
    taskInput.value = '';
    saveTasks();
    renderTasks();
  }
});

// Initial render
renderTasks();