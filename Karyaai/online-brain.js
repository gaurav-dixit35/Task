// Browser-side connector for the protected Gemini fallback. This file contains
// no provider key; the key stays in the Netlify Function environment.
export async function onlineBrain({ question, token, tasks, history, preferences, signal }) {
  const response = await fetch("/.netlify/functions/karya-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal,
    body: JSON.stringify({ question, tasks, history, preferences }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Advanced Karya AI is unavailable.");
  }
  if (!data.reply || typeof data.reply !== "string") {
    throw new Error("Advanced Karya AI returned an invalid response.");
  }
  return data.reply;
}
