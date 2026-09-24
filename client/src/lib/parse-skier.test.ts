import { describe, expect, it } from "vitest";
import { parseSkierLocally } from "./parse-skier";

describe("parseSkierLocally", () => {
  it("handles the typical description", () => {
    expect(
      parseSkierLocally(
        "Lisa is 25 years old. She's an intermediate skier, and you can spot her by her bright red jacket",
      ),
    ).toEqual({
      name: "Lisa",
      age: 25,
      level: "intermediate",
      notes: "You can spot her by her bright red jacket.",
    });
  });

  it("finds names after an introduction and maps level synonyms", () => {
    const r = parseSkierLocally("New skier, her name is Maya Chen, aged 9, first time on skis. Pink helmet");
    expect(r.name).toBe("Maya Chen");
    expect(r.age).toBe(9);
    expect(r.level).toBe("beginner");
    expect(r.notes).toBe("Pink helmet.");
  });

  it("leaves unknown fields null instead of guessing", () => {
    const r = parseSkierLocally("she has a blue jacket");
    expect(r.name).toBeNull();
    expect(r.age).toBeNull();
    expect(r.level).toBeNull();
    expect(r.notes).toBe("She has a blue jacket.");
  });
});
