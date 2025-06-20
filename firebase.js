// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBOEs1Ibj8v636R8IgzM5D6xqJkUzWjgko",
  authDomain: "task-759da.firebaseapp.com",
  projectId: "task-759da",
  storageBucket: "task-759da.firebasestorage.app",
  messagingSenderId: "297266929297",
  appId: "1:297266929297:web:637925e90365c710a8e930",
  measurementId: "G-JTPDDSTWDP"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export { auth, provider, db };
