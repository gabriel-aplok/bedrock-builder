const TOKEN_PREFIX = /^(gh[pousr]_|github_pat_|npm_|glpat-|xox[baprs]-)/;
const TOKENISH = /^[A-Za-z0-9._~-]{24,}$/;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // scheme://user:password@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1***@"],
  // npm and similar token config lines
  [/\b(_authToken|_auth|npm_token|NODE_AUTH_TOKEN)\s*=\s*\S+/gi, "$1=***"],
  [/\b(gh[pousr]|github_pat)_[A-Za-z0-9_]{16,}\b/g, "***"],
  [/\bnpm_[A-Za-z0-9]{30,}\b/g, "***"],
  [/\bglpat-[A-Za-z0-9_-]{16,}\b/g, "***"],
];

// a bare userinfo is only a secret when it is long or carries a token prefix.
function scrubUserinfo(text: string): string {
  return text.replace(
    /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi,
    (match, scheme: string, user: string) => {
      if (TOKEN_PREFIX.test(user) || TOKENISH.test(user)) return `${scheme}***@`;
      return match;
    },
  );
}

// strip credentials a tool may print back, like a remote url with a token.
export function redact(text: string): string {
  let safe = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) safe = safe.replace(pattern, replacement);
  return scrubUserinfo(safe);
}
