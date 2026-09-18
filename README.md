# Karya

Karya is a Firebase-backed task manager with a task-aware assistant. The main task list and Karya AI use the same signed-in user's Cloud Firestore tasks, so a change made by either surface is reflected in the other in real time.

## What Karya AI can do

- Add tasks with natural language: `Add submit report tomorrow at 5 pm, high priority`
- Organize tasks with projects and tags: `Add gym tomorrow #health project: Personal`
- Create daily or weekly routines: `Add standup daily at 9 am project: Work`
- Add notes, focus-time estimates, and subtasks through each task's details button
- List open, completed, overdue, today, and tomorrow tasks
- Filter the task list by view or project; search also finds projects and tags
- Complete, reopen, edit, rename, snooze, or delete tasks (delete requires confirmation)
- Analyse workload and suggest the best next task
- Show reminders, profile details, and refresh task data
- Change theme, use focus mode, save feedback, keep chat history, and use browser voice input
- Use Gemini as a protected fallback for unusual questions about Karya, planning, or the provided task context

Task mutations are handled by Karya's deterministic Firestore code; Gemini cannot create, edit, or delete a task by itself.

Repeating tasks need a due date. When a daily or weekly task is completed, Karya marks that occurrence complete and creates its next occurrence with its notes, estimate, tags, and unchecked subtasks.

## Free-first AI controls

Karya limits Advanced AI to 12 successful Gemini questions per signed-in user per day in that browser. It sends at most 12 relevant task summaries and six recent chat messages. Before the first Advanced AI request, the user must explicitly approve sending that limited context to Gemini. The Settings page can clear local AI history, consent, and the daily counter.

The **Karya AI Settings** section also lets each signed-in user choose spoken replies, local-planner response style, and whether Advanced AI context is allowed. These preferences are stored only in that browser.

This browser-side limit prevents accidental free-tier exhaustion; it is not an account-wide security quota. The serverless endpoint has its own short-window rate limit. For a public launch, move usage accounting to a durable backend store.

Offline task persistence is also opt-in because cached task data remains on the device. Enable it only on a trusted browser through Settings, then reload Karya.

## Gemini / Netlify setup

The Gemini credential must never be placed in `Karyaai/online-brain.js`, `firebase.js`, or any other browser file. The project contains a Netlify Function at `netlify/functions/karya-ai.mjs` that verifies the signed-in Firebase user before calling Gemini.

In the Netlify site dashboard, create these environment variables and make them available to Functions:

```text
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
```

Redeploy after adding or changing a variable. `.env.example` documents names only and must not contain a real credential. The server function rate-limits requests and sends Gemini only a bounded task summary plus a short conversation window.

## Firestore security

`firestore.rules` is included to restrict every task and AI-feedback document to its owner. Review it and deploy it to the Firebase project before production use:

```text
firebase deploy --only firestore:rules
```

Do not leave Firestore in test mode. The Netlify Function verifies the Firebase ID token, but Firestore rules remain the data-access boundary for the web app.

## Structure

```text
index.html                         Main task list
script.js                          Firestore task synchronization and reminders
Karyaai/ai.js                      Karya AI commands and UI coordination
Karyaai/online-brain.js            Browser connector to protected AI fallback
netlify/functions/karya-ai.mjs     Firebase-verified Gemini proxy
settings.html / set.js             Settings, analytics, and export
```

## Local checks

Run syntax checks before deploying:

```text
node --check script.js
node --check Karyaai/ai.js
node --check netlify/functions/karya-ai.mjs
```
