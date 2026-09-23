// Offline best guess at which skier a dictated note is about. The AI makes the
// real call once there's signal; this just files the note somewhere sensible
// in the meantime. Whole-word matching only, so "Ann" never matches "planning".

export interface NamedSkier {
  id: string;
  name: string;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function containsSequence(haystack: string[], needle: string[]) {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

// Returns null when nobody matches or it's a tie between different skiers.
export function guessSkier<T extends NamedSkier>(text: string, skiers: T[]): T | null {
  const said = words(text);
  const saidSet = new Set(said);
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;

  for (const skier of skiers) {
    const parts = words(skier.name).filter((p) => p.length >= 2);
    if (parts.length === 0) continue;
    let score = 0;
    if (parts.length > 1 && containsSequence(said, parts)) score = 3;
    else if (saidSet.has(parts[0])) score = 2;
    else if (parts.slice(1).some((p) => saidSet.has(p))) score = 1;
    if (score === 0) continue;
    if (score > bestScore) {
      best = skier;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
}
