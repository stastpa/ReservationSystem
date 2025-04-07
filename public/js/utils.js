// js/utils.js

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timeOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

function isBrightColor(hex) {
  const c = hex.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  return brightness > 186;
}

function getCurrentDateStr(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}

function isInReceptionInterval(fromMins, toMins) {
  const intervalStart = 20 * 60;
  const intervalEnd = 5 * 60;
  if (fromMins > toMins) {
    return (fromMins < 1440 && fromMins >= intervalStart) || (toMins >= 0 && toMins <= intervalEnd);
  } else {
    return (fromMins < intervalEnd || toMins <= intervalEnd) || (fromMins >= intervalStart || toMins > intervalStart);
  }
}
