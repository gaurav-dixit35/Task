import { auth, provider } from "./firebase.js";
import {
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "index.html";
  }
});

loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  loginStatus.textContent = "Opening secure Google sign-in…";
  try {
    await signInWithPopup(auth, provider);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Login failed:", error);
    loginStatus.textContent = error.code === "auth/popup-closed-by-user"
      ? "Sign-in was cancelled. You can try again whenever you’re ready."
      : "Sign-in could not be completed. Check your connection and try again.";
    loginBtn.disabled = false;
  }
});
