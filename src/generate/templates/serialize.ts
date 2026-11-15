export function renderJson(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}
