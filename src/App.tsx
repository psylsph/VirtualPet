import { useEffect, useRef, useState } from 'react';
import type { Needs, PetState, NeedKey } from './types';
import { registerAction, isQuietActive, msToClock } from './quietTime';

const IDLE_TO_DROWSY_MS = 8 * 60 * 1000;
const DROWSY_TO_SLEEP_MS = 2 * 60 * 1000; // => sleep at 10 min total
const AUTO_WAKE_MIN_MS = 5 * 60 * 1000;
const AUTO_WAKE_MAX_MS = 12 * 60 * 1000;

const clamp = (n:number, min=0, max=100) => Math.max(min, Math.min(max, n));

export default function App() {
  const [petState, setPetState] = useState<PetState>('AWAKE');
  const [needs, setNeeds] = useState<Needs>({
    hunger: 70, cleanliness: 70, playfulness: 70, affection: 70
  });
  const [quietUntil, setQuietUntil] = useState<number | null>(isQuietActive().until);
  const [now, setNow] = useState<number>(Date.now());
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);

  const lastInputRef = useRef<number>(Date.now());
  const autoSleepStartedRef = useRef<boolean>(false);

  // === idle → drowsy → sleep checks ===
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const since = now - lastInputRef.current;
    if (petState === 'AWAKE' && since >= IDLE_TO_DROWSY_MS) setPetState('DROWSY');
    if (since >= IDLE_TO_DROWSY_MS + DROWSY_TO_SLEEP_MS && petState !== 'SLEEPING') {
      setPetState('SLEEPING');
      autoSleepStartedRef.current = true;
      // Random auto-wake window (only for auto-sleep)
      const span = AUTO_WAKE_MIN_MS + Math.floor(Math.random() * (AUTO_WAKE_MAX_MS - AUTO_WAKE_MIN_MS));
      setSleepUntil(Date.now() + span);
    }
  }, [now, petState]);

  // Auto-wake if we set a sleepUntil
  useEffect(() => {
    if (!sleepUntil) return;
    if (Date.now() >= sleepUntil) {
      setPetState('AWAKE');
      setSleepUntil(null);
      autoSleepStartedRef.current = false;
    }
  }, [now, sleepUntil]);

  // needs decay every 15s while awake/drowsy
  useEffect(() => {
    const t = setInterval(() => {
      if (petState === 'AWAKE' || petState === 'DROWSY') {
        setNeeds(n => ({
          hunger: clamp(n.hunger - 1),
          cleanliness: clamp(n.cleanliness - 1),
          playfulness: clamp(n.playfulness - 1),
          affection: clamp(n.affection - 1),
        }));
      }
    }, 15000);
    return () => clearInterval(t);
  }, [petState]);

  // track any user input to reset idle timers
  useEffect(() => {
    const onAny = () => { lastInputRef.current = Date.now(); };
    window.addEventListener('pointerdown', onAny);
    window.addEventListener('keydown', onAny);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') lastInputRef.current = Date.now();
    });
    return () => {
      window.removeEventListener('pointerdown', onAny);
      window.removeEventListener('keydown', onAny);
    };
  }, []);

  // Quiet Time heartbeat
  useEffect(() => {
    const t = setInterval(() => {
      const { active, until } = isQuietActive();
      setQuietUntil(active ? until : null);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const doAction = (kind: 'FEED' | 'GROOM' | 'PLAY' | 'CUDDLE') => {
    // Quiet Time gate
    const qt = isQuietActive();
    if (qt.active) {
      setQuietUntil(qt.until);
      return;
    }

    // Register "active minute" and maybe start Quiet Time
    const { quietUntil: q, activeInWindow } = registerAction();
    setQuietUntil(q ?? null);

    // Apply action effects
    setPetState('AWAKE');
    lastInputRef.current = Date.now();
    setSleepUntil(null);
    autoSleepStartedRef.current = false;

    setNeeds(n => {
      const delta: Partial<Record<NeedKey, number>> = {
        FEED: { hunger: +15 },
        GROOM: { cleanliness: +15 },
        PLAY: { playfulness: +15 },
        CUDDLE: { affection: +15 },
      }[kind] as any;

      return {
        hunger: clamp(n.hunger + (delta.hunger ?? 0)),
        cleanliness: clamp(n.cleanliness + (delta.cleanliness ?? 0)),
        playfulness: clamp(n.playfulness + (delta.playfulness ?? 0)),
        affection: clamp(n.affection + (delta.affection ?? 0)),
      };
    });

    // Soft banner feedback (console – keep UI minimal)
    console.debug(`Active minutes in rolling hour: ${activeInWindow}`);
  };

  const tryWake = () => {
    const qt = isQuietActive();
    if (qt.active) { setQuietUntil(qt.until); return; }
    setPetState('AWAKE');
    setSleepUntil(null);
    autoSleepStartedRef.current = false;
    lastInputRef.current = Date.now();
    registerAction(); // waking counts as an action
  };

  const PetEmoji = () => {
    if (petState === 'SLEEPING') return <div className="pet-emoji" aria-label="sleeping pet">🐶💤</div>;
    if (petState === 'DROWSY')  return <div className="pet-emoji" aria-label="drowsy pet">🐶😪</div>;
    return <div className="pet-emoji" aria-label="awake pet">🐶✨</div>;
  };

  const renderBar = (label:string, value:number) => (
    <div className="bar">
      <label>{label}</label>
      <div className="fill" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );

  const quietActive = !!quietUntil && Date.now() < quietUntil;
  const quietRemaining = quietActive ? quietUntil! - Date.now() : 0;

  return (
    <div className="app">
      <header className="header">
        <span className="title">Pet Sim</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>No death · Auto-sleeps after 10m idle · 20m break/hr</span>
      </header>

      <main className="scene">
        <div className="pet-card" role="region" aria-label="pet area">
          <PetEmoji />
          <div className="state">State: {petState}</div>

          {quietActive && (
            <div className="qt-overlay">
              Quiet Time — take a breather: {msToClock(quietRemaining)}
            </div>
          )}

          {petState === 'SLEEPING' && (
            <div className="sleep-overlay">
              Zzz… {sleepUntil ? `wakes in ${msToClock(sleepUntil - Date.now())}` : 'resting'}
            </div>
          )}

          <div className="bars">
            {renderBar('Hunger', needs.hunger)}
            {renderBar('Cleanliness', needs.cleanliness)}
            {renderBar('Playfulness', needs.playfulness)}
            {renderBar('Affection', needs.affection)}
          </div>

          <div className="actions">
            <button onClick={() => doAction('FEED')} disabled={quietActive}>Feed 🍗</button>
            <button onClick={() => doAction('GROOM')} disabled={quietActive}>Groom 🧽</button>
            <button onClick={() => doAction('PLAY')} disabled={quietActive || petState === 'SLEEPING'}>Play 🧸</button>
            <button onClick={() => doAction('CUDDLE')} disabled={quietActive}>Cuddle 🤗</button>
          </div>

          {petState === 'SLEEPING' && (
            <>
              <div className="note">Ignored for 10m? I nap automatically.</div>
              <div style={{ height: 8 }} />
              <button onClick={tryWake} disabled={quietActive}>Wake gently 🌤️</button>
            </>
          )}

          {!quietActive && petState !== 'SLEEPING' && (
            <div className="banner">Tip: If you leave me alone for 10 minutes, I’ll nap.</div>
          )}
          {quietActive && (
            <div className="banner block">Actions disabled during Quiet Time. You can watch, not grind.</div>
          )}
        </div>
      </main>

      <footer className="footer">
        MVP demo. For real abuse-resistance, also enforce Quiet Time on the server.
      </footer>
    </div>
  );
}
