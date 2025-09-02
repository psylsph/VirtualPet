// Very small, client-side Quiet Time implementation using localStorage.
// For production, enforce server-side too.

const ACTION_MINUTES_KEY = 'psim_actionMinutes';
const QUIET_UNTIL_KEY = 'psim_quietUntil';

const HOUR_MINUTES = 60;
const QUIET_MIN_PER_HOUR = 20;
const ACTIVE_PLAY_LIMIT = HOUR_MINUTES - QUIET_MIN_PER_HOUR; // 40
const QUIET_BLOCK_MIN = 20;

const nowMinute = () => Math.floor(Date.now() / 60000);

function loadMinutes(): number[] {
  try {
    const raw = localStorage.getItem(ACTION_MINUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMinutes(mins: number[]) {
  localStorage.setItem(ACTION_MINUTES_KEY, JSON.stringify(mins));
}

export function getQuietUntil(): number | null {
  const v = localStorage.getItem(QUIET_UNTIL_KEY);
  return v ? parseInt(v, 10) : null;
}

function setQuietUntil(ts: number | null) {
  if (ts == null) localStorage.removeItem(QUIET_UNTIL_KEY);
  else localStorage.setItem(QUIET_UNTIL_KEY, String(ts));
}

function purgeOld(mins: number[], ref = nowMinute()): number[] {
  const cutoff = ref - (HOUR_MINUTES - 1);
  return mins.filter(m => m >= cutoff);
}

// Call when an action that *changes state* happens
export function registerAction(): { quietUntil: number | null, activeInWindow: number } {
  const m = nowMinute();
  let minutes = purgeOld(loadMinutes(), m);
  if (!minutes.includes(m)) minutes.push(m);
  saveMinutes(minutes);

  const active = minutes.length;
  let quietUntil = getQuietUntil();

  // If we just crossed the 40-min threshold, start Quiet Time for 20 min
  if (active >= ACTIVE_PLAY_LIMIT && (!quietUntil || Date.now() >= quietUntil)) {
    quietUntil = Date.now() + QUIET_BLOCK_MIN * 60 * 1000;
    setQuietUntil(quietUntil);
  }

  // If Quiet Time expired, clear it
  if (quietUntil && Date.now() >= quietUntil) {
    setQuietUntil(null);
    quietUntil = null;
  }

  return { quietUntil, activeInWindow: active };
}

export function isQuietActive(): { active: boolean, until: number | null } {
  const until = getQuietUntil();
  if (!until) return { active: false, until: null };
  if (Date.now() >= until) { setQuietUntil(null); return { active: false, until: null }; }
  return { active: true, until };
}

export function msToClock(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
