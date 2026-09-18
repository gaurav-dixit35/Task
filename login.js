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
    const messages = {
      "auth/popup-closed-by-user": "Sign-in was cancelled. You can try again whenever you’re ready.",
      "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for Karya, then try again.",
      "auth/unauthorized-domain": "This website is not authorised in Firebase yet. Add its domain in Firebase Authentication settings.",
      "auth/operation-not-allowed": "Google sign-in is not enabled for this Firebase project yet.",
      "auth/network-request-failed": "Karya could not reach Google sign-in. Check your internet connection and try again.",
    };
    loginStatus.textContent = messages[error.code] || "Sign-in could not be completed. Please try again.";
    loginBtn.disabled = false;
  }
});
