export async function karyaBrain({
  text,
  mode,
  user,
  tasks = [],
  context = {},
  memory = {},
}) {
  const t = text.toLowerCase().trim();
  const prefersShort = memory.preferredTone === "short";
  const prefersMotivation = memory.preferredTone === "motivational";

  const emotion = detectEmotion(t);
  if (context.focusMode && !text.startsWith("add")) {
    return {
      type: "chat",
      reply: "Focus mode active. Want to add or review a task?",
    };
  }

  if (isUnclearIntent(t) && (t.startsWith("add") || t.includes("schedule"))) {
    return {
      type: "chat",
      reply: toneReply(
        emotion,
        "I’m not fully sure about the timing \nTry saying:\n• tomorrow at 6pm\n• next Monday morning\n• in 2 hours",
        memory
      ),
    };
  }

  if (containsAny(t, ["motivation", "lazy", "tired", "give up"])) {
    return {
      type: "chat",
      reply: toneReply(
        emotion,
        random([
          "Action creates motivation. Start ONE small task now.",
          "Progress beats perfection. Just begin.",
          "Even 10 focused minutes today is a win.",
          "You don’t need motivation — momentum will create it.",
        ]),
        memory
      ),
    };
  }

  if (["hi", "hello", "hey"].includes(t)) {
    const name = memory.name ? ` ${memory.name}` : "";
    return {
      type: "chat",
      reply: memory?.name
        ? `Hey ${memory.name}  How can I help you today?`
        : "Hey  How can I help you today?",
    };
  }

  if (containsAny(t, ["what is this ai", "about this ai"])) {
    return {
      type: "chat",
      reply:
        "Karya AI helps you add tasks naturally, stay focused, analyse progress, and build consistency — without paid APIs.",
    };
  }

  if (containsAny(t, ["benefit", "profit"])) {
    return {
      type: "chat",
      reply:
        " Karya AI improves task completion, focus, and discipline — giving a premium AI feel at zero cost.",
    };
  }

  if (t.startsWith("add ") || containsAny(t, ["schedule", "plan"])) {
    return { type: "smart-add" };
  }

  if (containsAny(t, ["analyse", "progress", "stats"])) {
    return { type: "analyse" };
  }

  if (containsAny(t, ["reminder", "remind"])) {
    return { type: "reminders" };
  }

  const habitHint = detectHabit(tasks);
  if (habitHint) {
    return {
      type: "chat",
      reply: habitHint,
    };
  }

  if (containsAny(t, ["help me focus", "advice", "guide me"])) {
    return {
      type: "chat",
      reply: prefersShort
        ? "Focus on one task. Start now."
        : toneReply(emotion, productivityAdvice(tasks), memory),
    };
  }

  return {
    type: "chat",
    reply: toneReply(emotion, smartChat(text, tasks, context), memory),
  };
}

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function containsAny(text, keywords) {
  return keywords.some((k) => text.includes(k));
}

function isUnclearIntent(text) {
  const weakWords = ["sometime", "later", "soon", "maybe", "not sure"];
  return weakWords.some((w) => text.includes(w));
}

function detectHabit(tasks) {
  if (!tasks.length) return null;

  const frequency = {};
  tasks.forEach((t) => {
    if (!t.name) return;
    const key = t.name.toLowerCase();
    frequency[key] = (frequency[key] || 0) + 1;
  });

  const habit = Object.keys(frequency).find((k) => frequency[k] >= 3);
  if (!habit) return null;

  return ` I’ve noticed you often add "${habit}".  
Want to turn this into a routine?`;
}

function productivityAdvice(tasks) {
  const pending = tasks.filter((t) => !t.completed);

  if (!pending.length) {
    return " You’re clear today. Great time to plan tomorrow.";
  }

  const high = pending.find((t) => t.priority === "high");
  if (high) {
    return ` Focus on this first:\n"${high.name}"\nHigh impact, high return.`;
  }

  return ` Pick the easiest task and finish it fast. Momentum matters.`;
}

function smartChat(text, tasks, context) {
  const t = text.toLowerCase();

  if (t.includes("what should i do")) {
    const pending = tasks.filter((t) => !t.completed);
    if (!pending.length)
      return " You’re all clear! Want to plan something new?";
    return ` Start with: "${pending[0].name}"`;
  }

  if (t.includes("help")) {
    return `I can help you with:
•  Add tasks naturally
•  Analyse productivity
•  Manage reminders
•  Stay motivated`;
  }

  if (context.goal) {
    return ` You mentioned earlier:\n"${context.goal}"\n\nLet’s take one small step now.`;
  }

  return "I’m listening  What would you like to do next?";
}

function detectEmotion(text) {
  if (/stress|overwhelm|pressure|burnout/.test(text)) return "stressed";
  if (/sad|depressed|down|hopeless/.test(text)) return "sad";
  if (/angry|mad|frustrated/.test(text)) return "angry";
  if (/happy|excited|great|awesome|love/.test(text)) return "positive";
  return "neutral";
}

function toneReply(emotion, reply, memory = {}) {
  let finalReply = reply;

  if (memory.preferredTone === "short") {
    finalReply = reply.split("\n")[0];
  }

  if (memory.preferredTone === "motivational") {
    finalReply = ` ${finalReply}`;
  }

  switch (emotion) {
    case "stressed":
      return ` ${finalReply}`;
    case "sad":
      return ` ${finalReply}`;
    case "angry":
      return ` ${finalReply}`;
    default:
      return finalReply;
  }
}
