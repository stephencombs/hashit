export function summarizeToolActivity(toolName: string): string {
  const actionName = toolName.includes("__")
    ? toolName.split("__").at(-1) || toolName
    : toolName;
  const normalized = actionName
    .replace(/__/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Using tools";
  const words = normalized.split(" ").slice(-4);
  const phrase = words.join(" ").toLowerCase();
  return `Using ${phrase}`;
}
