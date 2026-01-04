import { onlineBrain } from "./online-brain.js";
import { auth, db } from "../firebase.js";
import { karyaBrain } from "./ai-brain.js";
import {
  collection,
  addDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

/* ================= CONTEXT MEMORY ================= */
let morningDone =
  JSON.parse(localStorage.getItem("karya_morning_done")) || false;

let aiContext = {
  goal: null,
  mood: "neutral",
  lastIntent: null,
  focusMode: JSON.parse(localStorage.getItem("karya_focus_mode")) || false,
  lastTaskMentioned: null,
  awaitingClarification: null,
};
aiContext.lastDecision = null;
const aiPersona = {
  tone: "neutral", // calm | strict | friendly | motivational
  productivityLevel: "normal", // low | normal | high
  focusMode: false,
  lastInteraction: Date.now(),
};

function recordDecision({ action, reason, confidence = 0.7, data = null }) {
  aiContext.lastDecision = {
    action,
    reason,
    confidence,
    data,
    time: new Date().toISOString(),
  };
}

/* ================= AI MEMORY (PHASE 8) ================= */
let aiMemory = JSON.parse(localStorage.getItem("karya_ai_memory")) || {
  name: null,
  preferredTone: "normal", // short | motivational | normal
  prefersVoice: true,
  preferredAction: "chat", // chat | smart-add | analyze
  activeTime: null, // morning | evening | night
};
/* ================= AI CORRECTION MEMORY (PHASE 18) ================= */

let aiCorrections = JSON.parse(
  localStorage.getItem("karya_ai_corrections")
) || {
  priorityFixes: {}, // phrase → corrected priority
  timeFixes: {}, // phrase → corrected time
  intentFixes: {}, // phrase → correct intent
};

function saveAiCorrections() {
  localStorage.setItem("karya_ai_corrections", JSON.stringify(aiCorrections));
}

/* ================= APP KNOWLEDGE BASE (PHASE 17) ================= */
const aiBtn = document.getElementById("karyaAiBtn");

aiBtn.addEventListener("click", () => {
  aiBtn.classList.remove("active");
  void aiBtn.offsetWidth; // force reflow
  aiBtn.classList.add("active");
});

const KARYA_KNOWLEDGE = {
  karya: `
Karya is a smart task management system designed to help users plan, track, and complete tasks efficiently.

It includes:
• Task management
• Priority handling
• Reminders
• Analytics
• Focus mode
• Offline support
• Progressive Web App installation
• Built-in AI assistant (Karya AI)

Karya works fully on web and can be installed like a mobile app.
`,

  karya_ai: `
Karya AI is the intelligent assistant inside the Karya app.

It helps users:
• Add tasks using natural language
• Understand priorities
• Analyze productivity
• Stay focused
• Receive proactive suggestions
• Use voice input and voice output
• Work offline with auto-sync

Karya AI learns user preferences over time.
`,

  settings: `
Settings allow you to customize how Karya works.

From Settings you can:
• Toggle focus mode
• Control AI voice
• Manage theme
• Clear or export data
• View app information
• Adjust preferences

Settings affect the entire Karya experience.
`,

  focus_mode: `
Focus Mode reduces distractions.

When enabled:
• AI responses become minimal
• Proactive messages stop
• Voice output is muted
• Only essential task actions are allowed

This helps during deep work sessions.
`,

  analyze: `
Analyze shows your productivity insights.

It includes:
• Total tasks
• Completed vs pending tasks
• Priority distribution
• Coaching suggestions

It helps you understand how you are working.
`,

  reminders: `
Reminders notify you about upcoming or overdue tasks.

They are triggered based on:
• Due date
• Priority
• Idle time

Reminders work online and sync when offline.
`,

  rating: `
Rating lets users give feedback about the app.

This helps improve Karya by understanding user experience.
`,

  install: `
Karya can be installed as an app.

On desktop:
• Click the install icon in the browser address bar

On mobile:
• Use "Add to Home Screen" from browser menu

Once installed, Karya works like a native app.
`,

  offline: `
Karya supports offline usage.

When offline:
• Tasks are saved locally
• AI continues basic operation
• Data syncs automatically when internet returns
`,
};
function matchKnowledgeQuestion(text) {
  const t = text.toLowerCase();

  // Whole project
  if (/what is karya$|explain karya$|about karya$/i.test(t)) {
    return KARYA_KNOWLEDGE.karya;
  }

  // AI only
  if (/karya ai|what is ai|explain ai|about ai/i.test(t)) {
    return KARYA_KNOWLEDGE.karya_ai;
  }

  // Settings
  if (/settings?|what is settings|explain settings/i.test(t)) {
    return KARYA_KNOWLEDGE.settings;
  }

  // Focus Mode
  if (/focus mode|deep work/i.test(t)) {
    return KARYA_KNOWLEDGE.focus_mode;
  }

  // Analyze
  if (/analyze|analysis|stats|progress/i.test(t)) {
    return KARYA_KNOWLEDGE.analyze;
  }

  // Reminders
  if (/reminder|notification/i.test(t)) {
    return KARYA_KNOWLEDGE.reminders;
  }

  // Rating
  if (/rating|feedback/i.test(t)) {
    return KARYA_KNOWLEDGE.rating;
  }

  // Install
  if (/install|add to home|pwa/i.test(t)) {
    return KARYA_KNOWLEDGE.install;
  }

  // Offline
  if (/offline|no internet/i.test(t)) {
    return KARYA_KNOWLEDGE.offline;
  }

  return null;
}
function detectCorrection(text) {
  const t = text.toLowerCase();

  if (/no|wrong|not that|i meant|change it|instead/i.test(t)) {
    return true;
  }

  return false;
}
function detectVoiceCommand(text) {
  const t = text.toLowerCase();

  if (/stop listening|pause listening|sleep/i.test(t)) {
    return { type: "stop-listening" };
  }

  if (/start listening|resume listening|wake up/i.test(t)) {
    return { type: "start-listening" };
  }

  if (/voice only mode|hands free mode/i.test(t)) {
    return { type: "enable-voice-only" };
  }

  if (/exit voice mode|disable voice/i.test(t)) {
    return { type: "disable-voice-only" };
  }

  if (/mute voice|stop speaking/i.test(t)) {
    return { type: "mute-voice" };
  }

  if (/unmute voice|start speaking/i.test(t)) {
    return { type: "unmute-voice" };
  }

  return null;
}

function handleVoiceCommand(command) {
  switch (command.type) {
    case "stop-listening":
      isListening = false;
      recognition.stop();
      system("Listening stopped");
      break;

    case "start-listening":
      if (!isListening) {
        isListening = true;
        recognition.start();
        system("Listening resumed");
      }
      break;

    case "enable-voice-only":
      voiceOnlyMode = true;
      recognition.continuous = true;
      system("Voice-only mode enabled");
      ai("You can speak freely. I am listening.");
      break;

    case "disable-voice-only":
      voiceOnlyMode = false;
      recognition.continuous = false;
      system("Voice-only mode disabled");
      break;

    case "mute-voice":
      speechEnabled = false;
      window.speechSynthesis.cancel();
      system("AI voice muted");
      break;

    case "unmute-voice":
      speechEnabled = true;
      system("AI voice unmuted");
      break;
  }
}

/* ================= ADAPTIVE INTELLIGENCE (PHASE 14) ================= */

let behaviorMemory = JSON.parse(
  localStorage.getItem("karya_behavior_memory")
) || {
  taskAddTimes: {}, // hour -> count
  priorityUsage: { high: 0, medium: 0, low: 0 },
  frequentTasks: {}, // name -> count
  procrastinationScore: 0,
  lastActiveHour: null,
};

function saveBehaviorMemory() {
  localStorage.setItem("karya_behavior_memory", JSON.stringify(behaviorMemory));
}
/* ================= PREDICTIVE TIME INTELLIGENCE (PHASE 15) ================= */

function getMostActiveHour() {
  const entries = Object.entries(behaviorMemory.taskAddTimes || {});
  if (!entries.length) return null;

  return Number(entries.reduce((a, b) => (a[1] > b[1] ? a : b))[0]);
}

let intelligenceStarted = false;

let sendTimeout;
let idleTimer = null;

let speechEnabled = true;
let lastAddedTask = null;

/* ================= DOM ================= */
const btn = document.getElementById("karyaAiBtn");
const panel = document.getElementById("karyaAiPanel");
const closeBtn = document.getElementById("closeAi");
const sendBtn = document.getElementById("sendBtn");
const inputEl = document.getElementById("karyaInput");
const messagesEl = document.getElementById("karyaMessages");
const aiVoiceBtn = document.getElementById("aiVoiceBtn");
const actionButtons = document.querySelectorAll(".action-btn");
const startNewChat = document.getElementById("startNewChat");
const openHistory = document.getElementById("openHistory");
const toggleSpeechBtn = document.getElementById("toggleSpeechBtn");
/* speech*/
toggleSpeechBtn?.addEventListener("click", () => {
  speechEnabled = !speechEnabled;

  toggleSpeechBtn.textContent = speechEnabled ? "🔊" : "🔇";

  if (!speechEnabled) {
    window.speechSynthesis.cancel();
    system(" AI voice muted");
  } else {
    system(" AI voice enabled");
  }
});
/* ================= VOICE STATE ================= */
let recognition = null;
let isListening = false;
let lastTranscript = "";
let speechQueue = [];
let isSpeaking = false;
let lastUserActivity = Date.now();
let proactiveCooldown = false;
let predictiveCooldown = false;
let voiceOnlyMode = false; // Phase 23

/* ================= NETWORK STATE (PHASE 13) ================= */
let isOnline = navigator.onLine;
let aiMode = "local"; // local | hybrid | online

window.addEventListener("online", () => {
  isOnline = true;
  updateAiMode();
  system("Back online. Hybrid AI enabled.");
  syncPendingActions();
});

window.addEventListener("offline", () => {
  isOnline = false;
  updateAiMode();
  system("Offline mode. Local AI only.");
});

function updateAiMode() {
  if (!navigator.onLine) {
    aiMode = "local";
    return;
  }

  // default hybrid when online
  aiMode = "hybrid";
}

/* ================= VOICE INPUT (FIXED) ================= */

function initVoice() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("SpeechRecognition not supported");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    aiVoiceBtn?.classList.add("listening");
  };

  recognition.onend = () => {
    if (isListening) {
      try {
        recognition.start();
      } catch (e) {
        console.warn("Restart blocked");
      }
    } else {
      aiVoiceBtn?.classList.remove("listening");
    }
  };

  recognition.onresult = (event) => {
    lastUserActivity = Date.now();

    const transcript = event.results[0][0].transcript.trim();
    if (!transcript) return;

    // 🎙 Voice command handling
    const command = detectVoiceCommand(transcript);

    if (command) {
      handleVoiceCommand(command);
      return;
    }

    inputEl.value = transcript;

    clearTimeout(sendTimeout);

    sendTimeout = setTimeout(
      () => {
        onSend();
      },
      voiceOnlyMode ? 400 : 1200
    );
  };

  recognition.onerror = (e) => {
    console.error("Voice error:", e);
    isListening = false;
    aiVoiceBtn?.classList.remove("listening");
  };
}
function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

window.addEventListener("load", initVoice);

/* ================= STATE ================= */
let currentAction = "chat";
let user = null;
let chatHistory = [];
const HISTORY_KEY = "karyaai_history_v3";

/* ================= AUTH ================= */
onAuthStateChanged(auth, (u) => {
  user = u || null;
  loadHistory(user ? user.uid : "anon");
});

/* ================= UI EVENTS ================= */
btn.onclick = openPanel;
closeBtn.onclick = closePanel;
startNewChat.onclick = newChat;
openHistory.onclick = showHistory;
sendBtn.onclick = onSend;

aiVoiceBtn?.addEventListener("click", () => {
  voiceOnlyMode = true;

  if (!recognition) {
    ai(" Voice not supported in this browser.");
    return;
  }

  if (isListening) {
    isListening = false;
    recognition.stop();
    system("Voice listening stopped");
  } else {
    isListening = true;
    recognition.start();
    system("Listening continuously...");
  }
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") onSend();
});

actionButtons.forEach((b) => {
  b.onclick = () => {
    actionButtons.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    currentAction = b.dataset.action;
    system(`Mode: ${b.textContent.trim()}`);
  };
});

/* ================= PANEL ================= */
function openPanel() {
  panel.classList.add("open");
  if (voiceOnlyMode && recognition && !isListening) {
    isListening = true;
    recognition.start();
  }

  startIntelligence();
  if (isMorning() && !aiContext.focusMode) {
    morningPlanner();
  }

  proactiveGreeting();
  startIdleCheck();

  if (!messagesEl.innerHTML) {
    const greeting = getTimeGreeting();
    const name = aiMemory.name ? ` ${aiMemory.name}` : "";

    ai(`${greeting}${name}   

I’m Karya AI — your smart task assistant.

Tell me what you want to do next.`);
  }
  system(`AI Mode: ${aiMode.toUpperCase()}`);
}

/*Greeting*/
function proactiveGreeting() {
  const hour = new Date().getHours();
  let timeGreeting = "Hey";

  if (hour < 12) timeGreeting = "Good morning";
  else if (hour < 18) timeGreeting = "Good afternoon";
  else timeGreeting = "Good evening";

  const name = aiMemory.name ? ` ${aiMemory.name}` : "";

  // 🔕 Respect focus mode
  if (aiContext.focusMode) {
    return ai(`${timeGreeting}${name}. Focus mode is ON. Ready when you are.`);
  }

  ai(`${timeGreeting}${name} 👋`);

  // 🧠 Task-aware nudge
  if (user) {
    getDocs(collection(db, "users", user.uid, "tasks")).then((snap) => {
      const tasks = snap.docs.map((d) => d.data());
      const pendingHigh = tasks.filter(
        (t) => !t.completed && t.priority === "high"
      );

      if (pendingHigh.length) {
        ai(
          ` You have ${pendingHigh.length} high-priority task(s).  
Want to start with "${pendingHigh[0].name}"?`
        );
      } else {
        ai(" Small progress today beats perfect plans tomorrow.");
      }
    });
  }
}
function startIdleCheck() {
  clearTimeout(idleTimer);

  idleTimer = setTimeout(() => {
    if (!messagesEl.innerHTML || aiContext.focusMode) return;

    ai(" I’m here if you want to plan something or add a task.");
  }, 15000); // 15 sec idle
}

function closePanel() {
  panel.classList.remove("open");

  if (isListening) {
    isListening = false;
    recognition.stop();
  }
}

/* ================= MESSAGES ================= */
function userMsg(text) {
  clearTimeout(idleTimer);
  append("karya-user", text);
  save({ type: "user", text, time: Date.now() });
}
async function ai(text) {
  text = normalizeAIReply(text);
  const finalText = applyPersonaTone(text);

  const msgEl = document.createElement("div");
  msgEl.className = "karya-msg karya-ai typing";
  messagesEl.appendChild(msgEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  await typeText(msgEl, finalText);
  msgEl.classList.remove("typing");

  speak(finalText);

  save({ type: "ai", text: finalText, time: Date.now() });
}

function system(text) {
  const d = document.createElement("div");
  d.style.opacity = "0.7";
  d.style.fontSize = "12px";
  d.textContent = text;
  messagesEl.appendChild(d);
}
function append(cls, text) {
  const d = document.createElement("div");
  d.className = `karya-msg ${cls}`;
  d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ================= HISTORY ================= */
function save(item) {
  chatHistory.push(item);
  if (chatHistory.length > 120) chatHistory.shift();
  localStorage.setItem(
    `${HISTORY_KEY}_${user?.uid || "anon"}`,
    JSON.stringify(chatHistory)
  );
}
function loadHistory(key) {
  chatHistory = JSON.parse(localStorage.getItem(`${HISTORY_KEY}_${key}`)) || [];
}
function showHistory() {
  if (!chatHistory.length) return system("No history yet.");
  system("Recent conversation:");
  chatHistory
    .slice(-8)
    .forEach((h) => system(`${h.type === "user" ? "You" : "AI"}: ${h.text}`));
}

function isComplexQuery(text) {
  return /why|explain|how does|difference|compare|analyze deeply|strategy/i.test(
    text
  );
}

function newChat() {
  messagesEl.innerHTML = "";
  chatHistory = [];
  ai(" New chat started. How can I help?");
  aiContext = {
    goal: null,
    mood: "neutral",
    lastIntent: null,
    lastTaskMentioned: null,
    awaitingClarification: null,
    focusMode: JSON.parse(localStorage.getItem("karya_focus_mode")) || false,
  };
}

/* ================= MAIN SEND ================= */
async function onSend() {
  if (aiContext.processing) return;

  aiContext.processing = true;
  lastUserActivity = Date.now();

  try {
    const text = inputEl.value.trim();

    /* ================= KNOWLEDGE BASE ================= */
    const knowledgeAnswer = matchKnowledgeQuestion(text);
    if (knowledgeAnswer) {
      aiContext.lastDecision = {
        action: "knowledge-answer",
        reason: "User asked for explanation about the app or a feature.",
      };
      return ai(knowledgeAnswer.trim());
    }

    /* ================= EXPLAIN AI DECISION ================= */
    if (/^why\??$|why did you|how did you decide/i.test(text)) {
      if (!aiContext.lastDecision) {
        return ai("I haven’t made a recent decision to explain yet.");
      }

      const d = aiContext.lastDecision;
      let explanation = `Here’s why:\n${d.reason}`;

      if (d.task) {
        explanation += `\nRelated task: "${d.task}"`;
      }

      return ai(explanation);
    }

    if (/explain your thinking|explain yourself/i.test(text)) {
      if (!aiContext.lastDecision) {
        return ai("Nothing recent to explain. Ask me to do something first.");
      }

      return ai(
        `My last action was "${aiContext.lastDecision.action}".\nReason: ${aiContext.lastDecision.reason}`
      );
    }

    /* ================= AUTONOMOUS CONFIRMATION ================= */
    if (
      aiContext.pendingAutonomousAction &&
      /yes|okay|sure|do it|go ahead/i.test(text)
    ) {
      const action = aiContext.pendingAutonomousAction;
      aiContext.pendingAutonomousAction = null;

      if (action.type === "promote-priority") {
        await promoteTaskPriority(action.taskId);
        return;
      }
    }

    /* ================= LEARN USER NAME ================= */
    const nameMatch = text.match(/(my name is|i am)\s+([a-z ]+)/i);
    if (nameMatch) {
      aiMemory.name = nameMatch[2].trim();
      saveAiMemory();
      return ai(`Nice to meet you, ${aiMemory.name}.`);
    }

    if (!text) return;

    /* ================= FOCUS MODE ================= */
    if (/focus mode|deep work|help me focus/i.test(text)) {
      aiContext.focusMode = !aiContext.focusMode;
      localStorage.setItem(
        "karya_focus_mode",
        JSON.stringify(aiContext.focusMode)
      );

      return ai(
        aiContext.focusMode
          ? "Focus Mode ON. I’ll keep things minimal."
          : "Focus Mode OFF. I’m back to full support."
      );
    }

    /* ================= SAME AS YESTERDAY ================= */
    if (/same as yesterday|do same again/i.test(text)) {
      if (!lastAddedTask) {
        return ai("I don’t have a previous task to repeat yet.");
      }

      return smartAdd(
        `add ${lastAddedTask.name} tomorrow priority ${lastAddedTask.priority}`
      );
    }

    /* ================= TONE PREFERENCE ================= */
    if (/talk short|short replies/i.test(text)) {
      aiMemory.preferredTone = "short";
      saveAiMemory();
      return ai("Got it. I’ll keep replies short.");
    }

    if (/be motivational|motivate me/i.test(text)) {
      aiMemory.preferredTone = "motivational";
      saveAiMemory();
      return ai("Got it. I’ll push you harder.");
    }

    if (/normal mode/i.test(text)) {
      aiMemory.preferredTone = "normal";
      saveAiMemory();
      return ai("Back to normal responses.");
    }

    /* ================= USER MESSAGE ================= */
    inputEl.value = "";
    userMsg(text);

    // Auto-learn verbosity
    if (text.length < 15) aiMemory.preferredTone = "short";
    else if (text.length > 60) aiMemory.preferredTone = "motivational";
    saveAiMemory();

    /* ================= CLARIFICATION RESUME ================= */
    if (aiContext.awaitingClarification) {
      const pending = aiContext.awaitingClarification;
      aiContext.awaitingClarification = null;
      return smartAdd(`${pending.text} ${text}`);
    }

    /* ================= CORRECTION LEARNING ================= */
    if (
      detectCorrection(text) &&
      lastAddedTask &&
      /high|medium|low/i.test(text)
    ) {
      learnPriorityCorrection(lastAddedTask.name, text);
      return ai("Understood. I’ll remember this preference for next time.");
    }

    updateContextFromText(text);

    /* ================= ACTION ROUTING ================= */
    if (currentAction === "smart-add") return smartAdd(text);
    if (currentAction === "analyse") return analyse();
    if (currentAction === "reminders") return reminders();

    await chat(text);

    /* ================= DEFER INTENT ================= */
    if (
      /later|not now|remind me later/i.test(text) &&
      aiContext.lastTaskMentioned
    ) {
      return ai(
        `Okay. I’ll wait.\nTell me when you want to schedule "${aiContext.lastTaskMentioned}".`
      );
    }
  } catch (error) {
    console.error("onSend error:", error);
    ai("Something went wrong. Please try again.");
  } finally {
    aiContext.processing = false;
  }
}

/* ================= CHAT INTELLIGENCE ================= */
async function chat(text) {
  let tasks = [];
  updatePersonaFromBehavior();

  if (user) {
    const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
    tasks = snap.docs.map((d) => d.data());
  }

  /* ===== HYBRID DECISION ===== */
  if (aiMode === "local") {
    const decision = await karyaBrain({
      text,
      mode: currentAction,
      user,
      tasks,
      context: aiContext,
      memory: aiMemory,
      offline: true,
    });

    return ai(
      addConfidenceDisclaimer(decision.reply, decision.confidence || 0.6)
    );
  }

  if (aiMode === "hybrid" && !isComplexQuery(text)) {
    const decision = await karyaBrain({
      text,
      mode: currentAction,
      user,
      tasks,
      context: aiContext,
      memory: aiMemory,
    });

    return ai(
      addConfidenceDisclaimer(decision.reply, decision.confidence || 0.6)
    );
  }

  /* ================= PHASE 21: ONLINE AI ================= */

  if (isOnline && isComplexQuery(text)) {
    const online = await onlineBrain(
      `User tone: ${aiPersona.tone}.
     Productivity: ${aiPersona.productivityLevel}.
     Answer clearly and briefly.
     Question: ${text}`
    );

    return ai(online.reply);
  }

  /* ===== ONLINE AI ===== */
  const online = await onlineBrain(text);
  return ai(online.reply);
}

/* ================= PHASE 4 SMART ADD ================= */

function parseSmartDate(text) {
  const now = new Date();
  const t = text.toLowerCase();

  const buckets = {
    morning: 9,
    afternoon: 13,
    evening: 18,
    night: 21,
  };

  if (t.includes("day after tomorrow")) now.setDate(now.getDate() + 2);
  else if (t.includes("tomorrow")) now.setDate(now.getDate() + 1);

  const inHours = t.match(/in (\d+) hour/);
  if (inHours) now.setHours(now.getHours() + Number(inHours[1]));

  Object.keys(buckets).forEach((b) => {
    if (t.includes(b)) now.setHours(buckets[b], 0);
  });

  const time = t.match(/(\d{1,2})(:\d{2})?\s?(am|pm)?/);
  if (time) {
    let h = Number(time[1]);
    if (time[3]?.toLowerCase() === "pm" && h < 12) h += 12;
    now.setHours(h, time[2] ? Number(time[2].slice(1)) : 0);
  }

  return now;
}

function detectPriority(text) {
  const t = text.toLowerCase();
  // Apply learned corrections
  for (const phrase in aiCorrections.priorityFixes) {
    if (t.includes(phrase)) {
      return aiCorrections.priorityFixes[phrase];
    }
  }

  if (
    /high priority|priority high|keep priority high|make it high|urgent|asap|critical|important|max|pluse|highest|positive|maximum/i.test(
      t
    )
  ) {
    return "high";
  }

  if (
    /low priority|priority low|optional|whenever|someday|not important|less|down|min|negative|minus|keep priority low|minimum/i.test(
      t
    )
  ) {
    return "low";
  }

  return "medium";
}
function learnPriorityCorrection(originalText, correctedText) {
  const original = originalText.toLowerCase();
  const corrected = correctedText.toLowerCase();

  if (corrected.includes("high")) {
    aiCorrections.priorityFixes[original] = "high";
  } else if (corrected.includes("low")) {
    aiCorrections.priorityFixes[original] = "low";
  } else if (corrected.includes("medium")) {
    aiCorrections.priorityFixes[original] = "medium";
  }

  saveAiCorrections();
}

function detectHabit(tasks) {
  const map = {};

  tasks.forEach((t) => {
    const key = t.name.toLowerCase();
    map[key] = (map[key] || 0) + 1;
  });

  const habit = Object.entries(map).find(([_, count]) => count >= 3);

  if (!habit) return null;

  return {
    name: habit[0],
    count: habit[1],
  };
}

async function smartAdd(text) {
  /* ---------- 1️⃣ TIME CLARIFICATION ---------- */
  const hasTime =
    /(today|tomorrow|am|pm|in \d+|morning|evening|night|noon)/i.test(text);

  if (!hasTime) {
    aiContext.awaitingClarification = {
      type: "task-time",
      text,
    };
    return ai(
      "I can schedule this for today evening by default. Or tell me a time."
    );
  }

  /* ---------- 2️⃣ AUTH CHECK ---------- */
  if (!user) return ai("Please login to save tasks.");

  /* ---------- 3️⃣ PARSE DATA (ONCE) ---------- */
  const date = parseSmartDate(text);

  // 🔧 FORCE priority detection FIRST (fixes high → medium bug)
  const priority = detectPriority(text) || "medium";

  // safer title cleanup
  const title =
    text
      .replace(/^add\s+/i, "")
      .replace(
        /(today|tomorrow|morning|evening|night|noon|at\s+\d+|\bin\s+\d+.*|\d+(:\d+)?\s*(am|pm)?)/gi,
        ""
      )
      .replace(/\b(high|medium|low)\b/gi, "")
      .trim() || "New Task";

  const taskPayload = {
    name: title,
    dueDate: date.toISOString(),
    completed: false,
    priority,
    createdAt: new Date().toISOString(),
  };

  /* ---------- 4️⃣ OFFLINE MODE ---------- */
  if (!navigator.onLine) {
    queueOfflineAction({
      type: "addTask",
      payload: taskPayload,
    });

    lastAddedTask = { name: title, priority };
    learnFromTask(taskPayload);

    return ai(
      "You're offline. Task saved locally and will sync automatically."
    );
  }
  // 🧠 Adaptive priority assist (Phase 14)
  if (!/priority|high|low|medium/i.test(text)) {
    const bias = getUserPriorityBias();
    if (bias !== "medium") {
      taskPayload.priority = bias;
    }
  }
  // 🧠 Predict missing scheduling
  if (!/today|tomorrow|am|pm|morning|evening|night/i.test(text)) {
    const bestHour = getMostActiveHour();
    if (bestHour !== null) {
      ai(
        `You usually work best around ${bestHour}:00.  
Want me to schedule this task for that time?`
      );
    }
  }

  /* ---------- 5️⃣ ONLINE SAVE ---------- */
  await addDoc(collection(db, "users", user.uid, "tasks"), taskPayload);

  lastAddedTask = { name: title, priority };
  learnFromTask(taskPayload);

  recordDecision({
    action: "add-task",
    reason: "User explicitly requested to add a task with time and priority.",
    confidence: 0.95,
    data: { title, priority },
  });

  /* ---------- 6️⃣ RESPONSE ---------- */
  ai(
    `Task added\n` +
      `${title}\n` +
      `${date.toLocaleString()}\n` +
      `Priority: ${priority.toUpperCase()}`
  );

  setTimeout(() => {
    ai("I’ll remind you closer to the time. Stay focused.");
  }, 1800);
}
function learnFromTask(task) {
  const hour = new Date(task.dueDate).getHours();

  // Learn time preference
  behaviorMemory.taskAddTimes[hour] =
    (behaviorMemory.taskAddTimes[hour] || 0) + 1;

  // Learn priority habit
  behaviorMemory.priorityUsage[task.priority] =
    (behaviorMemory.priorityUsage[task.priority] || 0) + 1;

  // Learn frequent tasks
  const key = task.name.toLowerCase();
  behaviorMemory.frequentTasks[key] =
    (behaviorMemory.frequentTasks[key] || 0) + 1;

  behaviorMemory.lastActiveHour = hour;

  saveBehaviorMemory();
}

/* ================= ANALYsE ================= */
async function analyse() {
  if (!user) return ai("Login required.");

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const tasks = snap.docs.map((d) => d.data());

  const pending = tasks.filter((t) => !t.completed).length;
  const completed = tasks.filter((t) => t.completed).length;
  const coaching = generateCoaching(tasks);

  ai(`📊 Productivity Analysis  
Total: ${tasks.length}  
Completed: ${completed}  
Pending: ${pending}  

${coaching || ""}
`);
}
function generateCoaching(tasks) {
  if (!tasks.length) return null;

  const completed = tasks.filter((t) => t.completed).length;
  const pending = tasks.length - completed;

  const highPriority = tasks.filter((t) => t.priority === "high").length;

  if (pending > completed) {
    return " Tip: Focus on completing pending tasks before adding new ones.";
  }

  if (highPriority === 0) {
    return " Tip: Mark at least one task as HIGH priority daily.";
  }

  return " You’re managing tasks well. Keep this momentum going!";
}
//
function getUserPriorityBias() {
  const p = behaviorMemory.priorityUsage;
  const max = Math.max(p.high, p.medium, p.low);

  if (max === p.high) return "high";
  if (max === p.low) return "low";
  return "medium";
}

/* ================= REMINDERS ================= */
async function reminders() {
  if (!user) return ai("Login required.");

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const upcoming = snap.docs
    .map((d) => d.data())
    .filter((t) => t.dueDate)
    .slice(0, 5);

  if (!upcoming.length) return ai("No upcoming tasks.");

  ai("🔔 Upcoming tasks:");
  upcoming.forEach((t) =>
    system(`${t.name} → ${new Date(t.dueDate).toLocaleString()}`)
  );
}
async function proactiveCheck() {
  if (!user) return;

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const tasks = snap.docs.map((d) => d.data());
  const activeHour = getMostActiveHour();
  const nowHour = new Date().getHours();

  if (
    activeHour !== null &&
    Math.abs(activeHour - nowHour) <= 1 &&
    !aiContext.focusMode
  ) {
    const suggestion = predictNextTask(tasks);
    if (suggestion) {
      ai(
        `This is usually your productive time.  
Want to work on "${suggestion.name}" now?`
      );
      return;
    }
  }

  if (!tasks.length) {
    ai("Tip: You have no tasks yet. Want to plan your day?");
    return;
  }

  const now = new Date();

  const overdue = tasks.filter(
    (t) => t.dueDate && !t.completed && new Date(t.dueDate) < now
  );

  if (overdue.length) {
    ai(
      `Reminder: You have ${overdue.length} overdue task(s).  
Start with "${overdue[0].name}".`
    );
    return;
  }
  const overdueCount = tasks.filter(
    (t) => !t.completed && new Date(t.dueDate) < new Date()
  ).length;

  if (overdueCount >= 3) {
    behaviorMemory.procrastinationScore++;
    saveBehaviorMemory();

    ai(
      "I’ve noticed some tasks are getting delayed. Want help breaking one into smaller steps?"
    );
    return;
  }

  const pending = tasks.filter((t) => !t.completed);

  if (pending.length) {
    aiContext.lastSuggestedTask = pending[0].name;
    aiContext.lastDecision = {
      action: "task-suggestion",
      reason: "You have pending tasks and have been idle for a while.",
      task: pending[0].name,
    };

    ai(`Next focus suggestion: "${pending[0].name}"`);
  }
}
//
async function autonomousPriorityCheck() {
  if (!user || aiContext.focusMode) return;

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const now = new Date();

  const overdue = tasks.find(
    (t) =>
      t.dueDate &&
      !t.completed &&
      new Date(t.dueDate) < now &&
      t.priority !== "high"
  );

  if (!overdue) return;

  aiContext.lastDecision = {
    action: "priority-promotion",
    reason: "The task is overdue and still not marked as high priority.",
    task: overdue.name,
  };

  ai(
    `Task "${overdue.name}" is overdue.\nDo you want me to mark it as HIGH priority?`
  );

  aiContext.pendingAutonomousAction = {
    type: "promote-priority",
    taskId: overdue.id,
  };
}
async function promoteTaskPriority(taskId) {
  if (!user) return;

  const ref = collection(db, "users", user.uid, "tasks");

  const snap = await getDocs(ref);
  const docRef = snap.docs.find((d) => d.id === taskId)?.ref;

  if (!docRef) return;

  await updateDoc(docRef, { priority: "high" });

  ai(
    `I marked the task as HIGH priority because it was overdue.\nThis helps prevent important work from being missed.`
  );
}

function predictNextTask(tasks) {
  if (!tasks.length) return null;

  const pending = tasks.filter((t) => !t.completed);
  if (!pending.length) return null;

  // 1️⃣ High priority first
  const high = pending.find((t) => t.priority === "high");
  if (high) return high;

  // 2️⃣ Earliest due date
  return pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
}

//
async function morningPlanner() {
  aiPersona.tone = "friendly";

  if (!user || aiContext.focusMode) return;

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const tasks = snap.docs.map((d) => d.data());

  const today = new Date().toDateString();

  const todayTasks = tasks.filter(
    (t) =>
      t.dueDate && new Date(t.dueDate).toDateString() === today && !t.completed
  );

  if (!todayTasks.length) {
    ai("Daily plan: No tasks scheduled for today. Want to add one?");
    return;
  }

  const high = todayTasks.find((t) => t.priority === "high");
  aiContext.lastDecision = {
    action: "morning-plan",
    reason: "It is morning and you have tasks scheduled for today.",
  };

  ai(
    `Daily plan ready:
• Tasks today: ${todayTasks.length}
• Priority focus: "${(high || todayTasks[0]).name}"`
  );
}

function typeText(element, text) {
  return new Promise((resolve) => {
    let i = 0;
    const speed = 18; // typing speed (lower = faster)

    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        setTimeout(type, speed);
      } else {
        resolve();
      }
    }
    type();
  });
}
/* ================= AI VOICE OUTPUT ================= */
function speak(text) {
  if (!speechEnabled) return;
  if (!("speechSynthesis" in window)) return;
  if (aiContext.focusMode) return;

  const chunks = text.match(/[^.!?]+[.!?]?/g) || [text];
  chunks.forEach((c) => speechQueue.push(c.trim()));

  processSpeechQueue();
}

function normalizeAIReply(text) {
  if (!text) return "";

  // Remove overconfidence phrases
  text = text.replace(/(definitely|absolutely|guaranteed|always)/gi, "usually");

  // Trim excessive length
  if (text.length > 700) {
    text = text.slice(0, 700) + "...";
  }

  return text.trim();
}
function addConfidenceDisclaimer(reply, confidence = 0.6) {
  if (confidence < 0.5) {
    return `I might be mistaken, but here’s my best suggestion:\n${reply}`;
  }
  return reply;
}

function processSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) return;

  isSpeaking = true;
  const text = speechQueue.shift();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 1;
  utter.pitch = 1.1;
  utter.volume = 1;

  utter.onend = () => {
    isSpeaking = false;
    processSpeechQueue(); // speak next
  };

  utter.onerror = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  window.speechSynthesis.speak(utter);
}

//
function saveAiMemory() {
  localStorage.setItem("karya_ai_memory", JSON.stringify(aiMemory));
}
//
function isMorning() {
  const h = new Date().getHours();
  return h >= 6 && h < 11;
}
function isEvening() {
  const h = new Date().getHours();
  return h >= 20 && h <= 23;
}
async function endOfDayReview() {
  if (!user || aiContext.focusMode) return;

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const tasks = snap.docs.map((d) => d.data());

  const today = new Date().toDateString();

  const todayTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === today
  );

  if (!todayTasks.length) return;

  const done = todayTasks.filter((t) => t.completed).length;

  ai(
    `Day summary:
• Completed: ${done}/${todayTasks.length}
• Progress matters more than perfection`
  );
}
function isNewWeek() {
  const last = localStorage.getItem("karya_week_report");
  const now = new Date();
  const week = `${now.getFullYear()}-${now.getMonth()}-${Math.floor(
    now.getDate() / 7
  )}`;

  if (last !== week) {
    localStorage.setItem("karya_week_report", week);
    return true;
  }
  return false;
}

async function weeklyReport() {
  if (!user) return;

  const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
  const tasks = snap.docs.map((d) => d.data());

  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;

  ai(
    `Weekly report:
• Tasks completed: ${completed}
• Completion rate: ${Math.round((completed / (total || 1)) * 100)}%
• Keep building consistency`
  );
}
/* ================= OFFLINE QUEUE (PHASE 13) ================= */

function queueOfflineAction(action) {
  const queue = JSON.parse(localStorage.getItem("karya_pending_actions")) || [];

  queue.push({
    ...action,
    createdAt: Date.now(),
  });

  localStorage.setItem("karya_pending_actions", JSON.stringify(queue));
}
//
async function syncPendingActions() {
  if (!user) return;

  const queue = JSON.parse(localStorage.getItem("karya_pending_actions")) || [];

  if (!queue.length) return;

  for (const action of queue) {
    if (action.type === "addTask") {
      await addDoc(collection(db, "users", user.uid, "tasks"), {
        name: action.payload.name,
        dueDate: action.payload.dueDate,
        priority: action.payload.priority,
        completed: false,
        createdAt: action.payload.createdAt || new Date().toISOString(),
      });
    }
  }

  localStorage.removeItem("karya_pending_actions");
  ai("All offline tasks synced successfully.");
}

//
function startIntelligence() {
  if (intelligenceStarted) return;
  intelligenceStarted = true;

  setInterval(() => {
    if (isMorning() && !morningDone) {
      morningPlanner();
      morningDone = true;
      localStorage.setItem("karya_morning_done", true);
    }

    if (!isMorning()) {
      morningDone = false;
      localStorage.setItem("karya_morning_done", false);
    }
  }, 60000);
  let nightDone = JSON.parse(localStorage.getItem("karya_night_done")) || false;

  setInterval(() => {
    if (isEvening() && !nightDone) {
      endOfDayReview();
      nightDone = true;
      localStorage.setItem("karya_night_done", true);
    }

    if (!isEvening()) {
      nightDone = false;
      localStorage.setItem("karya_night_done", false);
    }
  }, 60000);
  setInterval(() => {
    if (isNewWeek()) {
      weeklyReport();
    }
  }, 3600000);
  setInterval(async () => {
    if (aiContext.focusMode) return;
    if (proactiveCooldown) return;

    const idleTime = Date.now() - lastUserActivity;

    // 90 seconds idle
    if (idleTime > 90000) {
      proactiveCooldown = true;
      await proactiveCheck();
      await autonomousPriorityCheck();
      setTimeout(() => (proactiveCooldown = false), 120000);
    }

    // 🧠 Predictive idle nudge
    const activeHour = getMostActiveHour();
    if (
      activeHour !== null &&
      Math.abs(activeHour - new Date().getHours()) <= 1 &&
      idleTime > 60000
    ) {
      ai("Quick check-in: ready to make some progress?");
    }
  }, 15000);
}
function updatePersonaFromBehavior() {
  const idleTime = Date.now() - lastUserActivity;

  if (aiContext.focusMode) {
    aiPersona.tone = "strict";
  } else if (idleTime > 10 * 60 * 1000) {
    aiPersona.tone = "motivational";
    aiPersona.productivityLevel = "low";
  } else {
    aiPersona.tone = "calm";
    aiPersona.productivityLevel = "normal";
  }

  aiPersona.lastInteraction = Date.now();
}
function applyPersonaTone(text) {
  switch (aiPersona.tone) {
    case "strict":
      return text + "\nStay focused.";
    case "motivational":
      return text + "\nYou’re capable. Keep going.";
    case "friendly":
      return text;
    case "calm":
    default:
      return text;
  }
}

//
/* ================= OFFLINE SYNC ================= */
async function syncOfflineTasks() {
  if (!user || !navigator.onLine || !offlineQueue.length) return;

  for (const task of offlineQueue) {
    try {
      await addDoc(collection(db, "users", user.uid, "tasks"), task);
    } catch (e) {
      console.error("Sync failed:", e);
      return;
    }
  }

  offlineQueue = [];
  saveOfflineQueue();
  ai("Offline tasks synced successfully.");
}

//
function updateContextFromText(text) {
  const t = text.toLowerCase();

  // Detect goals
  if (t.includes("i want to") || t.includes("my goal")) {
    aiContext.goal = text;
  }

  // Detect focus for today
  if (t.includes("today") && (t.includes("finish") || t.includes("complete"))) {
    aiContext.goal = text;
  }

  // Detect mood
  if (/stress|overwhelm|tired|burnout/.test(t)) aiContext.mood = "stressed";
  else if (/sad|down|depressed/.test(t)) aiContext.mood = "sad";
  else if (/happy|excited|great/.test(t)) aiContext.mood = "positive";
  else aiContext.mood = "neutral";
  // Track last mentioned task name
  const taskMatch = text.match(/add (.+)/i);
  if (taskMatch) {
    aiContext.lastTaskMentioned = taskMatch[1];
  }
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) aiMemory.activeTime = "morning";
  else if (hour >= 12 && hour < 18) aiMemory.activeTime = "afternoon";
  else aiMemory.activeTime = "night";

  saveAiMemory();
}
