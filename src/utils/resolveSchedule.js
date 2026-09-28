const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Resolves a raw {day, time} pair from the request body into an absolute
 * UTC Date to schedule against.
 *
 * `day` accepts two forms (the assessment brief doesn't specify which, so
 * we document and support both - see README "Assumptions"):
 *   1. An ISO date: "2026-09-30"
 *   2. A weekday name: "Monday" -> resolves to the NEXT occurrence of that
 *      weekday (today counts as "next" if the time hasn't passed yet).
 *
 * `time` accepts "HH:mm" or "HH:mm:ss" in 24-hour format.
 *
 * `timezoneOffsetMinutes` (optional, default 0/UTC): minutes to ADD to the
 * given local wall-clock time to convert it to UTC. E.g. for IST
 * (UTC+5:30), pass -330 (i.e. local time minus 5h30m = UTC).
 */
function resolveSchedule({ day, time, timezoneOffsetMinutes = 0, now = new Date() }) {
  const timeMatch = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) {
    throw new Error('time must be in HH:mm or HH:mm:ss (24-hour) format');
  }
  const [, hh, mm, ss] = timeMatch;
  const hours = Number(hh);
  const minutes = Number(mm);
  const seconds = ss ? Number(ss) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error('time contains an out-of-range hour/minute/second');
  }

  const dayStr = String(day).trim();
  let baseDateUTC;

  const isoMatch = dayStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    baseDateUTC = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), hours, minutes, seconds));
  } else if (WEEKDAYS.includes(dayStr.toLowerCase())) {
    const targetDow = WEEKDAYS.indexOf(dayStr.toLowerCase());
    const nowUTC = new Date(now.getTime());
    const candidate = new Date(
      Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), hours, minutes, seconds)
    );
    let dayDiff = targetDow - candidate.getUTCDay();
    if (dayDiff < 0) dayDiff += 7;
    if (dayDiff === 0 && candidate.getTime() <= now.getTime()) dayDiff = 7; // today's slot already passed -> next week
    candidate.setUTCDate(candidate.getUTCDate() + dayDiff);
    baseDateUTC = candidate;
  } else {
    throw new Error('day must be an ISO date (YYYY-MM-DD) or a weekday name (e.g. "Monday")');
  }

  // Apply timezone offset: local time + offset = UTC
  const scheduledAt = new Date(baseDateUTC.getTime() + timezoneOffsetMinutes * 60 * 1000);
  return scheduledAt;
}

module.exports = { resolveSchedule, WEEKDAYS };
