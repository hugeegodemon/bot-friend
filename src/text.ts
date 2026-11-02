export function sanitizeDiscordText(text: string, botUserId: string): string {
  return text
    .replace(new RegExp(`<@!?${botUserId}>`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitDiscordMessage(text: string, maxLength: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength + 1);
    const breakpoints = [candidate.lastIndexOf("\n"), candidate.lastIndexOf(" ")];
    const splitAt = Math.max(...breakpoints);
    const safeSplit = splitAt >= Math.floor(maxLength * 0.5) ? splitAt : maxLength;
    chunks.push(remaining.slice(0, safeSplit).trim());
    remaining = remaining.slice(safeSplit).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
