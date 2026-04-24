type RequestHeaders = {
  authorization?: string;
  cookie?: string;
};

function readCookieValue(rawCookie: string, key: string): string | null {
  const target = `${key}=`;
  const parts = rawCookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(target)) continue;
    const value = trimmed.slice(target.length).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Extract workspace JWT from trusted channels:
 * 1) Authorization: Bearer <jwt>
 * 2) HttpOnly cookie (for SSE / browser credentials flows)
 */
export function extractWorkspaceJwt(headers: RequestHeaders): string | null {
  const auth = headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookie = headers.cookie;
  if (typeof cookie === 'string' && cookie.trim()) {
    return (
      readCookieValue(cookie, 'maxwell_workspace_jwt') ??
      readCookieValue(cookie, 'workspace_jwt')
    );
  }

  return null;
}
