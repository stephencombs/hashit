import { describe, expect, it } from "vitest";
import { buildArgsPreview, buildResultSummary } from "./message-part-previews";

// ---------------------------------------------------------------------------
// buildArgsPreview
// ---------------------------------------------------------------------------
describe("buildArgsPreview", () => {
  it("returns the first two scalar values joined by ', '", () => {
    expect(buildArgsPreview(JSON.stringify({ name: "Alice", age: 30 }))).toBe(
      "Alice, 30",
    );
  });

  it("returns only the first value when there is one scalar", () => {
    expect(buildArgsPreview(JSON.stringify({ query: "foo" }))).toBe("foo");
  });

  it("skips non-scalar values and returns the scalars", () => {
    expect(
      buildArgsPreview(JSON.stringify({ filters: ["a", "b"], limit: 10 })),
    ).toBe("10");
  });

  it("truncates the summary at 60 chars with an ellipsis", () => {
    const long = "x".repeat(61);
    const result = buildArgsPreview(JSON.stringify({ key: long }));
    expect(result).toHaveLength(60);
    expect(result?.endsWith("...")).toBe(true);
  });

  it("returns undefined for an empty args string", () => {
    expect(buildArgsPreview("")).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    expect(buildArgsPreview("{bad}")).toBeUndefined();
  });

  it("returns undefined for a JSON array at the top level", () => {
    expect(buildArgsPreview(JSON.stringify(["a", "b"]))).toBeUndefined();
  });

  it("returns undefined for a JSON scalar at the top level", () => {
    expect(buildArgsPreview(JSON.stringify(42))).toBeUndefined();
  });

  it("returns undefined when all values are non-scalar", () => {
    expect(
      buildArgsPreview(JSON.stringify({ a: { nested: 1 }, b: [1, 2] })),
    ).toBeUndefined();
  });

  it("returns undefined for an empty object", () => {
    expect(buildArgsPreview(JSON.stringify({}))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildResultSummary
// ---------------------------------------------------------------------------
describe("buildResultSummary", () => {
  it("returns undefined for undefined content", () => {
    expect(buildResultSummary(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string content", () => {
    expect(buildResultSummary("")).toBeUndefined();
  });

  it("summarises a JSON array as '{n} results'", () => {
    expect(buildResultSummary(JSON.stringify([1, 2, 3]))).toBe("3 results");
  });

  it("uses 'result' singular for a 1-element array", () => {
    expect(buildResultSummary(JSON.stringify(["only"]))).toBe("1 result");
  });

  it("lists keys when the object has 3 or fewer keys", () => {
    expect(buildResultSummary(JSON.stringify({ name: "Alice", age: 30 }))).toBe(
      "name, age",
    );
  });

  it("returns '{n} fields' when the object has more than 3 keys", () => {
    expect(buildResultSummary(JSON.stringify({ a: 1, b: 2, c: 3, d: 4 }))).toBe(
      "4 fields",
    );
  });

  it("returns the plain string when it is 80 chars or shorter", () => {
    const short = "a".repeat(80);
    expect(buildResultSummary(short)).toBe(short);
  });

  it("truncates a long plain string with an ellipsis", () => {
    const long = "b".repeat(81);
    const result = buildResultSummary(long);
    expect(result).toHaveLength(80);
    expect(result?.endsWith("...")).toBe(true);
  });

  it("falls back to string truncation for malformed JSON", () => {
    expect(buildResultSummary("{bad}")).toBe("{bad}");
  });

  it("falls back to the raw string for a JSON null literal", () => {
    expect(buildResultSummary(JSON.stringify(null))).toBe("null");
  });
});
