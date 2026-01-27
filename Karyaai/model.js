export function smartSuggestions(tasks) {
  if (!tasks.length) return "You have no tasks yet! Start by adding one.";

  const pending = tasks.filter((t) => !t.completed).length;
  const completed = tasks.filter((t) => t.completed).length;

  return `
 Your Productivity Summary
---------------------------
Completed: ${completed}
Pending: ${pending}

Ask me:
• What should I do next?
• Generate my plan for today
• Which tasks are most important?
`;
}
