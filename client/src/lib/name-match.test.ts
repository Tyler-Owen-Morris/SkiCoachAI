import { describe, expect, it } from "vitest";
import { guessSkier } from "./name-match";

const skiers = [
  { id: "1", name: "Ann Lee" },
  { id: "2", name: "Jake Moss" },
  { id: "3", name: "Jake Turner" },
  { id: "4", name: "Beth" },
];

describe("guessSkier", () => {
  it("matches a first name as a whole word only", () => {
    expect(guessSkier("Beth's pole plant was late", skiers)?.id).toBe("4");
    expect(guessSkier("planning the next run", skiers)).toBeNull();
  });

  it("prefers the full name and refuses to guess on a tie", () => {
    expect(guessSkier("jake moss nice edging", skiers)?.id).toBe("2");
    expect(guessSkier("jake nice edging", skiers)).toBeNull();
  });

  it("falls back to a surname", () => {
    expect(guessSkier("Turner needs more angulation", skiers)?.id).toBe("3");
  });
});
