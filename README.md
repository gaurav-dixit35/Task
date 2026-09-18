<p align="center">
  <img src="./icons/logo.png" alt="Karya logo" width="88" />
</p>

<h1 align="center">Karya</h1>

<p align="center">
  A focused task manager with an AI assistant that works with your real tasks.
</p>

<p align="center">
  <a href="https://karyatask.netlify.app/login.html"><strong>Open Karya ↗</strong></a>
  &nbsp;·&nbsp;
  <a href="#features">Features</a>
  &nbsp;·&nbsp;
  <a href="#run-and-deploy">Run & deploy</a>
</p>

---

## What is Karya?

Karya is a Firebase-backed task manager designed for clear, everyday planning. Tasks are stored in the signed-in user’s Cloud Firestore account and synchronise in real time across open sessions.

Karya AI sits on top of the same task data. It can handle common task actions directly, without depending on an AI model. For unusual planning questions, it can optionally use a protected Gemini fallback—never a browser-exposed API key.

**Live app:** [karyatask.netlify.app/login.html](https://karyatask.netlify.app/login.html)

## Features

### Task management

- Create tasks with a title, project, tags, priority, and due date.
- Keep notes, time estimates, and up to 50 subtasks per task.
- Search tasks, projects, and tags; filter by project or status; sort by due date, priority, or completion.
- View open, today, overdue, and completed work at a glance.
- Create daily and weekly recurring tasks. Completing one automatically creates its next occurrence.
- Use browser notifications, reminder sounds, snooze, undo delete, offline task caching, exports, and analytics.

### Karya AI

- Add a task naturally: `Add submit report tomorrow at 5 pm, high priority`
- Organise tasks: `Add gym tomorrow #health project: Personal`
- Create routines: `Add standup daily at 9 am project: Work`
- List, complete, reopen, rename, edit, snooze, or delete tasks. Deletion always requires confirmation.
- Analyse workload and suggest the next best task.
- Use speech input, optional spoken replies, focus mode, chat history, and response-style preferences.
- Fall back to a free local planning assistant when offline, Gemini is unavailable, or the free daily model limit is reached.

> Karya AI performs task changes with deterministic Firestore code. Gemini is an optional answer fallback; it cannot independently create, edit, complete, or delete tasks.

## How the AI works

```text
User request
   │
   ├─ Recognised task command ──> Karya AI ──> Firestore task action
   │                                      └─> real-time task UI update
   │
   └─ Unusual planning question ──> local planner
                                  └─> optional Gemini fallback
                                       (Netlify Function + Firebase token check)
```

The local planner is always free and does not send task data away. Advanced AI is optional and asks for consent before sending a bounded task summary and short conversation window to Gemini.

## Privacy and free-first limits

- Advanced AI is limited to **12 successful Gemini questions per signed-in user per day in that browser**.
- At most 12 relevant task summaries and six recent chat messages are sent for an Advanced AI request.
- Karya AI Settings lets the user choose spoken replies, local response style, and whether Advanced AI context is allowed.
- Clearing AI data removes locally stored AI history, preferences, consent, and the local daily counter. Tasks are not deleted.
- Offline task storage is opt-in because it keeps task data on the current device.

The browser daily counter protects the free tier from accidental use; it is not an account-wide quota. The Netlify endpoint also rate-limits requests. A larger public release should move usage accounting to a durable backend store.

## Tech stack

| Area | Technology |
| --- | --- |
| Front end | HTML, CSS, vanilla JavaScript |
| Authentication | Firebase Authentication with Google sign-in |
| Data | Cloud Firestore with real-time listeners |
| Optional AI | Gemini, called only through a Netlify Function |
| Hosting | Netlify |
| Offline support | Service worker and optional Firestore IndexedDB persistence |

## Run and deploy

This is a static site—there is no package installation step for the browser app.

1. Create a Firebase project and enable **Google Authentication** and **Cloud Firestore**.
2. Update `firebase.js` with that project’s web configuration.
3. Deploy the static site and `netlify/functions/karya-ai.mjs` to Netlify.
4. In the Netlify site dashboard, add these environment variables to the **Functions** scope:

   ```text
   GEMINI_API_KEY=your_google_ai_studio_key
   GEMINI_MODEL=gemini-2.5-flash
   FIREBASE_WEB_API_KEY=your_firebase_web_api_key
   ```

5. Deploy the Firestore rules before allowing production users:

   ```bash
   firebase deploy --only firestore:rules
   ```

6. Restrict the Firebase web API key to your approved web origins in Google Cloud/Firebase.

`.env.example` documents environment-variable names only. Never put a real Gemini key in `firebase.js`, `Karyaai/online-brain.js`, or any other browser file.

## Project structure

```text
index.html                       Main task workspace
script.js                        Task UI, Firestore sync, reminders, task details
login.html / login.js            Google sign-in experience
settings.html / set.js           App, export, privacy, and Karya AI settings
Karyaai/ai.js                    Task-aware AI commands and UI coordination
Karyaai/ai-brain.js              Free local planning fallback
Karyaai/online-brain.js          Browser connector to the protected AI endpoint
netlify/functions/karya-ai.mjs   Firebase-verified Gemini proxy
firestore.rules                  Firestore owner and field-validation rules
service-worker.js                PWA cache and offline shell
```

## Local verification

Run these checks before deploying changes:

```bash
node --check script.js
node --check set.js
node --check Karyaai/ai.js
node --check netlify/functions/karya-ai.mjs
git diff --check
```

## Production checklist

- [ ] Firestore rules deployed
- [ ] Firebase Authentication authorised domains configured
- [ ] Firebase API key restricted to approved origins
- [ ] Netlify Function environment variables configured
- [ ] Google sign-in, task creation, AI consent, and recurring tasks manually tested
- [ ] New service worker cache verified after deployment

---

Built for calmer planning with **Karya**.
