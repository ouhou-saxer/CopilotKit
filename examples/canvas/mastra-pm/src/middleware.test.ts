// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkAccess } from "./middleware";

const configured = { user: "saxer", password: "geheim-ä", production: true };

function basic(user: string, password: string) {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

// NextResponse.next() marks the request as passed through.
const passes = (response: Response) =>
  response.headers.get("x-middleware-next") === "1";

describe("board password protection", () => {
  it("lets requests with the right credentials through", () => {
    expect(passes(checkAccess(basic("saxer", "geheim-ä"), configured))).toBe(
      true,
    );
  });

  it("asks for credentials when none or wrong ones are sent", () => {
    for (const header of [
      null,
      basic("saxer", "falsch"),
      basic("andere", "geheim-ä"),
      "Basic kein-base64!",
      "Bearer token",
    ]) {
      const response = checkAccess(header, configured);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
    }
  });

  it("refuses every request in production when no password is set", () => {
    const response = checkAccess(basic("saxer", "geheim-ä"), {
      user: undefined,
      password: undefined,
      production: true,
    });
    expect(response.status).toBe(503);
  });

  it("stays open in development when no password is set", () => {
    const response = checkAccess(null, {
      user: undefined,
      password: undefined,
      production: false,
    });
    expect(passes(response)).toBe(true);
  });
});
