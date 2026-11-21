/** Matches the isolated source publisher's installed hourly UTC timer. */
export function sourceDispatchSlots(day: Date, notBefore: Date) {
  const start = new Date(day);
  start.setUTCHours(0, 0, 0, 0);
  return Array.from(
    { length: 9 },
    (_, index) => new Date(+start + ((15 + index) * 60 + 17) * 60_000),
  ).filter((slot) => slot >= notBefore);
}

export function isSourceDispatchSlot(date: Date) {
  return (
    date.getUTCHours() >= 15 &&
    date.getUTCHours() <= 23 &&
    date.getUTCMinutes() === 17 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}
