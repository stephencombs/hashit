import { v2ThreadMessagesPageInputSchema } from "./domain";

describe("V2 server domain contracts", () => {
  it("defaults message page limit and trims thread ids", () => {
    expect(
      v2ThreadMessagesPageInputSchema.parse({
        threadId: " thread-1 ",
      }),
    ).toEqual({
      threadId: "thread-1",
      limit: 80,
    });
  });

  it("caps message page requests to explicit bounds", () => {
    expect(() =>
      v2ThreadMessagesPageInputSchema.parse({
        threadId: "thread-1",
        limit: 201,
      }),
    ).toThrow();
  });
});
