import {
  buildV2TerminalEvents,
  createV2CustomChunk,
  getRunTerminalEventName,
} from "./events";

describe("V2 durable custom events", () => {
  it("maps terminal run states to durable event names", () => {
    expect(getRunTerminalEventName("completed")).toBe("run_complete");
    expect(getRunTerminalEventName("aborted")).toBe("run_aborted");
    expect(getRunTerminalEventName("awaiting_input")).toBe("run_waiting_input");
    expect(getRunTerminalEventName("failed")).toBe("run_error");
    expect(getRunTerminalEventName("running")).toBe("run_error");
  });

  it("emits run terminal and persistence completion events in order", () => {
    const events = buildV2TerminalEvents({
      threadId: "thread-1",
      runState: { status: "completed" },
    });

    expect(events.map((event) => event.name)).toEqual([
      "run_complete",
      "persistence_complete",
    ]);
    expect(events[0]).toMatchObject({
      type: "CUSTOM",
      value: { threadId: "thread-1", status: "completed", error: null },
    });
  });

  it("creates timestamped custom chunks", () => {
    const before = Date.now();
    const chunk = createV2CustomChunk("event_name", { ok: true });
    const after = Date.now();

    expect(chunk).toMatchObject({
      type: "CUSTOM",
      name: "event_name",
      value: { ok: true },
    });
    expect(chunk.timestamp).toBeGreaterThanOrEqual(before);
    expect(chunk.timestamp).toBeLessThanOrEqual(after);
  });
});
