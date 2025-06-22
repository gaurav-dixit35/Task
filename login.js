// login.js
import { auth, provider } from './firebase.js';
import { signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js';

const loginBtn = document.getElementById('loginBtn');
const form = document.getElementById('traditionalLogin');

// Redirect if already logged in
onAuthStateChanged(auth, user => {
  if (user) window.location.href = 'index.html';
});

// Google login
loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
    window.location.href = 'index.html';
  } catch (error) {
    alert("Google Login failed: " + error.message);
  }
});

// Traditional login
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'index.html';
  } catch (error) {
    alert("Email Login failed: " + error.message);
  }
});
