const WORLD_NAME_RE = /^[A-Z][A-Z0-9^_\[\{\}\]]*$/;

export function normalizeWorldName(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidWorldName(name: string): boolean {
  const n = normalizeWorldName(name);
  if (n.length < 1 || n.length > 24) return false;
  return WORLD_NAME_RE.test(n);
}

export function worldNameHint(): string {
  return "ALL CAPS, starts with A–Z; allowed: ^ _ [ ] { }";
}
