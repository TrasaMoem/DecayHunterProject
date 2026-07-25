// First char: A-Z, ], [, _, ^
// After first: A-Z, 0-9, ], [, }, {, _, -, ^
const WORLD_NAME_RE = /^[A-Z\]\[_\^][A-Z0-9\]\[\}\{_\-\^]*$/;

export function normalizeWorldName(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidWorldName(name: string): boolean {
  const n = normalizeWorldName(name);
  if (n.length < 1 || n.length > 24) return false;
  return WORLD_NAME_RE.test(n);
}

export function worldNameHint(): string {
  return "ALL CAPS, starts with A–Z, ], [, _, ^; allowed: A–Z, 0–9, ], [, }, {, _, -, ^";
}
