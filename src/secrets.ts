export interface RedactionResult {
  text: string;
  detected: string[];
}

const secretPatterns = [
  {
    label: "GitHub Personal Access Token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    label: "GitHub access token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  },
  {
    label: "Google API key",
    pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  },
  {
    label: "API key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "Discord token",
    pattern: /\b[A-Za-z0-9_-]{20,30}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}\b/g,
  },
] as const;

export function redactSecrets(input: string): RedactionResult {
  const detected = new Set<string>();
  let text = input;

  for (const { label, pattern } of secretPatterns) {
    text = text.replace(pattern, () => {
      detected.add(label);
      return `[已遮蔽：${label}]`;
    });
  }

  return { text, detected: [...detected] };
}
