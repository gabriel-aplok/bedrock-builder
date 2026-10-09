// tiny ansi colors, replaces the picocolors dependency.
const enabled =
  !process.env.NO_COLOR && process.env.TERM !== "dumb" && process.stdout.isTTY === true;

function wrap(open: string, close: string, text: string): string {
  if (!enabled) return text;
  return `\u001b[${open}m${text}\u001b[${close}m`;
}

const pc = {
  black: (text: string): string => wrap("30", "39", text),
  red: (text: string): string => wrap("31", "39", text),
  green: (text: string): string => wrap("32", "39", text),
  yellow: (text: string): string => wrap("33", "39", text),
  cyan: (text: string): string => wrap("36", "39", text),
  gray: (text: string): string => wrap("90", "39", text),
  dim: (text: string): string => wrap("2", "22", text),
  bold: (text: string): string => wrap("1", "22", text),
  bgCyan: (text: string): string => wrap("46", "49", text),
};

export default pc;
