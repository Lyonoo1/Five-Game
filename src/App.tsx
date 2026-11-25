import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { EndGameModal, LevelUpModal, PauseModal } from './components/Modals';
import { TitleScreen } from './components/TitleScreen';
import { WuxiaGameEngine } from './game/engine';
import type {
  EndRunSummary,
  GamePhase,
  HudSnapshot,
  SectId,
  UpgradeOption,
} from './game/types';

const BEST_TIME_KEY = 'wuxia5000_best_time_v1';

function readBestTime(): number {
  try {
    const val = Number(window.localStorage.getItem(BEST_TIME_KEY) || '0');
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WuxiaGameEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [selectedSect, setSelectedSect] = useState<SectId>('qingcheng');
  const [muted, setMuted] = useState(false);
  const [bestElapsedSec, setBestElapsedSec] = useState<number>(() => readBestTime());
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [levelChoices, setLevelChoices] = useState<UpgradeOption[]>([]);
  const [rerollsLeft, setRerollsLeft] = useState(2);
  const [endSummary, setEndSummary] = useState<EndRunSummary | null>(null);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  const selectedSectRef = useRef<SectId>(selectedSect);
  selectedSectRef.current = selectedSect;

  const levelChoicesRef = useRef<UpgradeOption[]>(levelChoices);
  levelChoicesRef.current = levelChoices;

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    const bodyState = phase === 'levelup' ? 'paused' : phase;
    document.body.dataset.state = bodyState;
  }, [phase]);

  const startRun = useCallback((sectOverride?: SectId) => {
    const sect = sectOverride ?? selectedSectRef.current;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.dataset.state = 'playing';
    setEndSummary(null);
    setLevelChoices([]);
    setPhase('playing');
    engineRef.current?.startNewRun(sect);
  }, []);

  const pauseGame = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    setPhase('paused');
    engineRef.current?.setPhase('paused');
  }, []);

  const resumeGame = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setPhase('playing');
    engineRef.current?.setPhase('playing');
  }, []);

  const backToTitle = useCallback(() => {
    setBestElapsedSec(readBestTime());
    setEndSummary(null);
    setLevelChoices([]);
    setPhase('title');
    engineRef.current?.setPhase('title');
  }, []);

  const toggleMute = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const nextMuted = eng.sound.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleSelectUpgrade = useCallback((option: UpgradeOption) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setLevelChoices([]);
    setPhase('playing');
    engineRef.current?.selectUpgrade(option);
  }, []);

  const handleReroll = useCallback(() => {
    engineRef.current?.rerollUpgrades();
  }, []);

  // Mount isolated Canvas2D engine once
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const engine = new WuxiaGameEngine(host, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onLevelUpChoices: (choices, rerolls) => {
        setLevelChoices(choices);
        setRerollsLeft(rerolls);
        setPhase('levelup');
      },
      onRunFinished: (summary) => {
        setEndSummary(summary);
        setBestElapsedSec(Math.max(readBestTime(), summary.bestElapsedSec));
        setPhase('gameover');
      },
    });

    engineRef.current = engine;
    setHud(engine.getCurrentHudSnapshot());

    // Support ?autostart=1 to jump directly into active play
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      document.body.dataset.state = 'playing';
      setPhase('playing');
      engine.startNewRun(selectedSectRef.current, false);
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Global keyboard shortcuts across phases
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const current = phaseRef.current;

      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
        return;
      }

      if (current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startRun();
        }
        return;
      }

      if (current === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          pauseGame();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          startRun();
        }
        return;
      }

      if (current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          resumeGame();
        }
        return;
      }

      if (current === 'levelup') {
        if (e.code === 'Digit1' && levelChoicesRef.current[0]) {
          e.preventDefault();
          handleSelectUpgrade(levelChoicesRef.current[0]);
        } else if (e.code === 'Digit2' && levelChoicesRef.current[1]) {
          e.preventDefault();
          handleSelectUpgrade(levelChoicesRef.current[1]);
        } else if (e.code === 'Digit3' && levelChoicesRef.current[2]) {
          e.preventDefault();
          handleSelectUpgrade(levelChoicesRef.current[2]);
        }
        return;
      }

      if (current === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startRun();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectUpgrade, pauseGame, resumeGame, startRun, toggleMute]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1b1917]">
      {/* Isolated Canvas2D Container — never unmounted or re-rendered by HUD ticks */}
      <div
        ref={canvasHostRef}
        className="absolute inset-0 w-full h-full"
        aria-label="侠影五千年 战斗画布"
      />

      {phase === 'title' && (
        <TitleScreen
          selectedSect={selectedSect}
          bestElapsedSec={bestElapsedSec}
          onSelectSect={setSelectedSect}
          onStart={() => startRun()}
        />
      )}

      {phase !== 'title' && hud && (
        <GameHud
          hud={hud}
          muted={muted}
          onToggleMute={toggleMute}
          onPause={pauseGame}
          onRestart={() => startRun()}
        />
      )}

      {phase === 'levelup' && hud && (
        <LevelUpModal
          level={hud.level}
          choices={levelChoices}
          rerollsLeft={rerollsLeft}
          onSelect={handleSelectUpgrade}
          onReroll={handleReroll}
        />
      )}

      {phase === 'paused' && hud && (
        <PauseModal
          hud={hud}
          onResume={resumeGame}
          onRestart={() => startRun()}
          onBackToTitle={backToTitle}
        />
      )}

      {phase === 'gameover' && endSummary && (
        <EndGameModal
          summary={endSummary}
          onPlayAgain={() => startRun()}
          onBackToTitle={backToTitle}
        />
      )}
    </div>
  );
}
