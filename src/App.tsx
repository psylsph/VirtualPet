import { useEffect, useRef, useState } from 'react';
import type { Needs, PetState, NeedKey, PetType } from './types';
import { registerAction, isQuietActive, msToClock } from './quietTime';
import * as Snd from './sound';

const IDLE_TO_DROWSY_MS = 8 * 60 * 1000;
const DROWSY_TO_SLEEP_MS = 2 * 60 * 1000; // => sleep at 10 min total
const AUTO_WAKE_MIN_MS = 5 * 60 * 1000;
const AUTO_WAKE_MAX_MS = 12 * 60 * 1000;

const clamp = (n:number, min=0, max=100) => Math.max(min, Math.min(max, n));

export default function App() {
  const [petState, setPetState] = useState<PetState>('AWAKE');
  const [petType, setPetType] = useState<PetType>('DOG');
  const [needs, setNeeds] = useState<Needs>({
    hunger: 70, cleanliness: 70, playfulness: 70, affection: 70
  });
  const [quietUntil, setQuietUntil] = useState<number | null>(isQuietActive().until);
  const [now, setNow] = useState<number>(Date.now());
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    const v = localStorage.getItem('sound');
    return v !== 'off';
  });

  const lastInputRef = useRef<number>(Date.now());
  const autoSleepStartedRef = useRef<boolean>(false);
  const actionTimerRef = useRef<number | null>(null);
  const [action, setAction] = useState<('FEED'|'GROOM'|'PLAY'|'CUDDLE') | null>(null);

  // load/save pet type from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('petType');
    if (saved === 'DOG' || saved === 'CAT' || saved === 'RABBIT' || saved === 'HAMSTER') {
      setPetType(saved);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('petType', petType);
  }, [petType]);

  // inform sound module of current pet
  useEffect(() => {
    try { Snd.setPetType(petType); } catch {}
  }, [petType]);

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
    // unlock/resume audio context on first gesture
    const unlock = () => { Snd.resume(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') lastInputRef.current = Date.now();
    });
    return () => {
      window.removeEventListener('pointerdown', onAny);
      window.removeEventListener('keydown', onAny);
    };
  }, []);

  // apply mute setting to sound module
  useEffect(() => {
    Snd.setMuted(!soundOn);
    localStorage.setItem('sound', soundOn ? 'on' : 'off');
    // manage snore loop on mute toggle
    if (soundOn && petState === 'SLEEPING') {
      Snd.resume();
      Snd.startSnore();
    } else {
      Snd.stopSnore();
    }
  }, [soundOn]);

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

    // Trigger transient action animation/state
    if (actionTimerRef.current) {
      window.clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
    setAction(kind);
    const duration = kind === 'PLAY' ? 2000 : 900;
    actionTimerRef.current = window.setTimeout(() => setAction(null), duration);

    // Sound per action
    // Ensure context is resumed before attempting to play
    Snd.resume();
    if (soundOn) {
      if (kind === 'FEED') Snd.playFeed();
      else if (kind === 'GROOM') Snd.playGroom();
      else if (kind === 'CUDDLE') Snd.playCuddle();
      else if (kind === 'PLAY') Snd.playPlay();
    }

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
    if (soundOn) Snd.playWake();
    Snd.stopSnore();
  };

  // play sounds when transitioning into sleep via auto-sleep
  const prevStateRef = useRef<PetState>('AWAKE');
  useEffect(() => {
    if (petState !== prevStateRef.current) {
      if (petState === 'SLEEPING') {
        if (soundOn) {
          Snd.resume();
          Snd.playSleep();
          Snd.startSnore();
        }
      } else {
        Snd.stopSnore();
      }
      prevStateRef.current = petState;
    }
  }, [petState, soundOn]);

  const PetEmoji = () => {
    const emojiByType: Record<PetType, string> = {
      DOG: '🐶',
      CAT: '🐱',
      RABBIT: '🐰',
      HAMSTER: '🐹',
    };
    const labelBase = petType.toLowerCase();
    const stateClass = petState.toLowerCase();
    const actionClass = action ? `action-${action.toLowerCase()}` : '';
    return (
      <div
        className={`pet-emoji ${labelBase} ${stateClass} ${actionClass}`}
        aria-label={`${labelBase} ${stateClass}`}
      >
        <span className="pet-icon">
          <span className="pet-glyph">{emojiByType[petType]}</span>
          {(petState === 'SLEEPING' || petState === 'DROWSY') && (
            <span className={`zzz ${petState === 'SLEEPING' ? 'sleep' : 'drowsy'}`}>💤</span>
          )}
          {action === 'FEED' && <span className="overlay feed" aria-hidden>🍗</span>}
          {action === 'GROOM' && <span className="overlay groom" aria-hidden>✨</span>}
          {action === 'CUDDLE' && <span className="overlay cuddle" aria-hidden>💖</span>}
          {action === 'PLAY' && petType === 'DOG' && (
            <span className="play-scene dog" aria-hidden>
              <span className="ball">⚽</span>
            </span>
          )}
          {action === 'PLAY' && petType === 'CAT' && (
            <span className="play-scene cat" aria-hidden>
              <span className="ball">🧶</span>
            </span>
          )}
          {action === 'PLAY' && petType === 'HAMSTER' && (
            <span className="play-scene hamster" aria-hidden>
              <span className="wheel"><span className="spokes" /></span>
            </span>
          )}
          {action === 'PLAY' && petType === 'RABBIT' && (
            <span className="play-scene rabbit" aria-hidden>
              <span className="butterfly">🦋</span>
              <span className="butterfly b2">🦋</span>
            </span>
          )}
        </span>
      </div>
    );
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
  const totalToSleep = IDLE_TO_DROWSY_MS + DROWSY_TO_SLEEP_MS;
  const idleSince = now - lastInputRef.current;
  const sleepCountdownMs = Math.max(0, totalToSleep - idleSince);

  return (
    <div className="app">
      <header className="header">
        <span className="title">My Pet</span>
        <select
          aria-label="Choose your pet"
          value={petType}
          onChange={(e) => setPetType(e.target.value as PetType)}
          style={{ marginLeft: 'auto' }}
        >
          <option value="DOG">Dog 🐶</option>
          <option value="CAT">Cat 🐱</option>
          <option value="RABBIT">Rabbit 🐰</option>
          <option value="HAMSTER">Hamster 🐹</option>
        </select>
        <button
          className="icon-btn"
          aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
          title={soundOn ? 'Mute sound' : 'Unmute sound'}
          onClick={() => setSoundOn(s => !s)}
          style={{ marginLeft: 8 }}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Auto-sleeps after 10m idle · 20m break/hr</span>
      </header>

      <main className="scene">
        <div className="pet-card" role="region" aria-label="pet area">
          <PetEmoji />
          <div className="state">State: {petState}</div>
          {petState !== 'SLEEPING' && (
            <div className="note" aria-live="polite">Auto-sleep in {msToClock(sleepCountdownMs)}</div>
          )}

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
        <span>By Stuart Harding (2025) · </span><a href="https://github.com/psylsph/VirtualPet">GitHub</a>
      </footer>
    </div>
  );
}
