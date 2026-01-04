const GEMINI_API_KEY = "PASTE_YOUR_KEY_HERE";

export async function onlineBrain(prompt) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    const data = await res.json();

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I couldn’t generate a response.";

    return { reply };
  } catch (err) {
    console.error("Online AI error:", err);
    return {
      reply:
        "I had trouble reaching advanced intelligence. Please try again later.",
    };
  }
}
