import { describe, expect, it } from "vitest";
import { rankFreeSlots } from "./calendar-slots.js";

describe("rankFreeSlots", () => {
  it("returns deterministic tool-backed slots outside busy ranges", () => {
    const slots = rankFreeSlots({
      time_min: "2026-08-24T13:00:00.000Z",
      time_max: "2026-08-24T21:00:00.000Z",
      duration_minutes: 30,
      timezone: "America/Toronto",
      working_day_start: "09:00",
      working_day_end: "17:00",
      buffer_minutes: 0
    }, [{ start: "2026-08-24T13:00:00.000Z", end: "2026-08-24T14:00:00.000Z" }]);
    expect(slots).toHaveLength(3);
    expect(slots[0]?.start).toBe("2026-08-24T14:00:00.000Z");
    expect(slots.every((slot) => slot.source === "GOOGLE_FREEBUSY")).toBe(true);
  });

  it("returns no slots when the window is fully busy", () => {
    const slots = rankFreeSlots({
      time_min: "2026-08-24T13:00:00.000Z", time_max: "2026-08-24T14:00:00.000Z",
      duration_minutes: 30, timezone: "America/Toronto", working_day_start: "09:00", working_day_end: "17:00", buffer_minutes: 0
    }, [{ start: "2026-08-24T13:00:00.000Z", end: "2026-08-24T14:00:00.000Z" }]);
    expect(slots).toEqual([]);
  });
});
