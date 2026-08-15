// Session management — tracks active sessions with rotating tokens

let _sessions: Map<string, { userId: string; createdAt: Date; lastActive: Date; userAgent?: string }> = new Map();

export function createSession(userId: string, token: string, userAgent?: string, ipAddress?: string): void {
  _sessions.set(token, {
    userId,
    createdAt: new Date(),
    lastActive: new Date(),
    userAgent,
  });
}

export function validateSession(token: string): string | null {
  const session = _sessions.get(token);
  if (!session) return null;
  session.lastActive = new Date();
  return session.userId;
}

export function revokeSession(token: string): void {
  _sessions.delete(token);
}

export function revokeAllUserSessions(userId: string): void {
  for (const [token, session] of _sessions.entries()) {
    if (session.userId === userId) {
      _sessions.delete(token);
    }
  }
}

export function getUserSessions(userId: string): Array<{ token: string; createdAt: Date; lastActive: Date; userAgent?: string }> {
  const result: Array<{ token: string; createdAt: Date; lastActive: Date; userAgent?: string }> = [];
  for (const [token, session] of _sessions.entries()) {
    if (session.userId === userId) {
      result.push({ token, ...session });
    }
  }
  return result;
}