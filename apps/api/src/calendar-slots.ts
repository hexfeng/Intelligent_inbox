import type { CalendarSlot, MeetingConstraints } from "@intelligent-inbox/contracts";

const STEP_MINUTES = 30;

export function rankFreeSlots(constraints: MeetingConstraints, busy: Array<{ start: string; end: string }>): CalendarSlot[] {
  const min = new Date(constraints.time_min).getTime();
  const max = new Date(constraints.time_max).getTime();
  const duration = constraints.duration_minutes * 60_000;
  const buffer = constraints.buffer_minutes * 60_000;
  const busyRanges = busy.map((item) => [new Date(item.start).getTime() - buffer, new Date(item.end).getTime() + buffer] as const);
  const slots: CalendarSlot[] = [];

  for (let start = min; start + duration <= max && slots.length < 3; start += STEP_MINUTES * 60_000) {
    const end = start + duration;
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: constraints.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short"
    }).formatToParts(new Date(start));
    const values = Object.fromEntries(local.map((part) => [part.type, part.value]));
    if (values.weekday === "Sat" || values.weekday === "Sun") continue;
    const hhmm = `${values.hour}:${values.minute}`;
    const endParts = new Intl.DateTimeFormat("en-CA", { timeZone: constraints.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(end));
    const endValues = Object.fromEntries(endParts.map((part) => [part.type, part.value]));
    const endHhmm = `${endValues.hour}:${endValues.minute}`;
    if (hhmm < constraints.working_day_start || endHhmm > constraints.working_day_end) continue;
    if (busyRanges.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart)) continue;
    slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), timezone: constraints.timezone, source: "GOOGLE_FREEBUSY" });
  }
  return slots;
}
