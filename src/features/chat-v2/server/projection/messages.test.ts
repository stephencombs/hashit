import { findSupersededAssistantIds, toProjectedV2Messages } from "./messages";

describe("projection message transforms", () => {
  it("merges durable ui-spec events into assistant message parts", () => {
    const projected = toProjectedV2Messages(
      "thread-1",
      [
        {
          id: "user-1",
          role: "user",
          content: "Show revenue",
          parts: [{ type: "text", content: "Show revenue" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          parts: [],
        },
      ],
      new Map([
        [
          "assistant-1",
          [{ type: "ui-spec", spec: { component: "DataGrid" }, specIndex: 0 }],
        ],
      ]),
    );

    expect(projected).toMatchObject([
      {
        id: "user-1",
        role: "user",
        content: "Show revenue",
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "ui-spec", spec: { component: "DataGrid" }, specIndex: 0 },
        ],
      },
    ]);
  });

  it("marks earlier assistant messages in the same user turn as superseded", () => {
    expect(
      findSupersededAssistantIds([
        { id: "user-1", role: "user", content: "A", parts: [] },
        { id: "assistant-1", role: "assistant", content: "B", parts: [] },
        { id: "assistant-2", role: "assistant", content: "C", parts: [] },
        { id: "user-2", role: "user", content: "D", parts: [] },
        { id: "assistant-3", role: "assistant", content: "E", parts: [] },
      ]),
    ).toEqual(["assistant-1"]);
  });
});
