import { SessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionUser {
  id: string;
  githubId: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  accessToken: string;
}

export interface SessionData {
  user?: SessionUser;
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "review-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7일
  },
};

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export async function getSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (!session.isLoggedIn) {
    session.isLoggedIn = defaultSession.isLoggedIn;
  }

  return session;
}

export async function getUser() {
  const session = await getSession();
  return session.user;
}

export async function isAuthenticated() {
  const session = await getSession();
  return session.isLoggedIn && !!session.user;
}

