import { describe, expect, it } from "vitest";
import { appPassword, isValidSession, safeEqual, safeNextPath, sessionToken } from "./session";

describe("password protection", () => {
  it("is off without APP_PASSWORD", () => {
    expect(appPassword({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(appPassword({ APP_PASSWORD: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(isValidSession(undefined, null)).toBe(true);
  });

  it("accepts only the token for the current password", () => {
    const t = sessionToken("correct horse");
    expect(t).not.toContain("correct");
    expect(isValidSession(t, "correct horse")).toBe(true);
    expect(isValidSession(t, "new password")).toBe(false);
    expect(isValidSession(undefined, "correct horse")).toBe(false);
    expect(isValidSession("garbage", "correct horse")).toBe(false);
  });

  it("compares safely and only redirects within the site", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeNextPath("/deals?x=1")).toBe("/deals?x=1");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
