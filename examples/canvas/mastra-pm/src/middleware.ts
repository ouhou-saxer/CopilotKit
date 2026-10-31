import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Password protection for the hosted board (HTTP Basic Auth).
 *
 * The chat uses the server's OpenAI key, so a public deployment must not be
 * open to everyone. Set BOARD_USER and BOARD_PASSWORD on the host.
 *
 * - Both set: every page and API request needs these credentials.
 * - Not set in production: every request is refused (fail closed).
 * - Not set in development: no protection, so `pnpm dev` works as before.
 */
export function middleware(request: NextRequest) {
  return checkAccess(request.headers.get("authorization"), {
    user: process.env.BOARD_USER,
    password: process.env.BOARD_PASSWORD,
    production: process.env.NODE_ENV === "production",
  });
}

export const config = {
  // Everything except Next.js build assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

type AccessSettings = {
  user: string | undefined;
  password: string | undefined;
  production: boolean;
};

export function checkAccess(
  authorization: string | null,
  { user, password, production }: AccessSettings,
) {
  if (!user || !password) {
    if (!production) return NextResponse.next();
    return new NextResponse(
      "Zugang nicht eingerichtet: BOARD_USER und BOARD_PASSWORD fehlen.",
      { status: 503 },
    );
  }

  const credentials = parseBasicAuth(authorization);
  if (
    credentials &&
    safeEqual(credentials.user, user) &&
    safeEqual(credentials.password, password)
  ) {
    return NextResponse.next();
  }

  return new NextResponse("Anmeldung erforderlich.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="SaXer Board", charset="UTF-8"',
    },
  });
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), (c) =>
      c.charCodeAt(0),
    );
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/** Compares in time independent of where the strings differ. */
function safeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
