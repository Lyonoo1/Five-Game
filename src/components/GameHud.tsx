import React, { useEffect, useState } from 'react';
import {
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  PASSIVES,
  SECTS,
  WEAPONS,
} from '../game/catalog';
import { formatClock } from '../game/rules';
import type { HudSnapshot } from '../game/types';
import { PassiveSvgIcon, UtilitySvgIcon, WeaponSvgIcon } from './WuxiaIcons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export function GameHud({
  hud,
  muted,
  onToggleMute,
  onPause,
  onRestart,
}: GameHudProps) {
  // Delayed trailing ghost bar for smooth damage feedback
  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const [ghostHpPct, setGhostHpPct] = useState(hpPct);

  useEffect(() => {
    if (hpPct >= ghostHpPct) {
      setGhostHpPct(hpPct);
      return;
    }
    const timer = window.setTimeout(() => {
      setGhostHpPct(hpPct);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [hpPct, ghostHpPct]);

  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpNext)) * 100));
  const sect = SECTS[hud.sectId];
  const lowHp = hpPct <= 30;

  return (
    <>
      {/* Subtle compositor-only Xuan-ink atmospheric vignette / critical low-HP edge warning */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[5] pointer-events-none transition-opacity duration-300"
        style={{
          background: lowHp
            ? 'radial-gradient(circle at center, rgba(0,0,0,0) 56%, rgba(185,28,28,0.34) 100%)'
            : 'radial-gradient(circle at center, rgba(0,0,0,0) 62%, rgba(30,25,20,0.22) 100%)',
        }}
      />
      <div
        className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-3 sm:p-4"
        aria-label="战斗界面状态栏"
      >
      {/* Top Edge Strip: 3 Compact World-Matched Clusters */}
      <div className="w-full flex items-start justify-between gap-3">
        {/* Top-Left: Hero Vitality Bar + Sect & Streak */}
        <div className="flex flex-col gap-1.5 min-w-[205px] sm:min-w-[238px]">
          <div className="flex items-baseline justify-between gap-3 px-0.5">
            <span className="text-sm font-bold text-[#faf4e8] ink-stroke-text tracking-wider">
              {sect.name}
            </span>
            <span
              className={`font-num text-xs font-bold ink-stroke-text ${
                lowHp ? 'text-[#fca5a5]' : 'text-[#faf4e8]'
              }`}
              data-testid="hud-hp"
            >
              {hud.hp}/{hud.maxHp}
            </span>
          </div>

          {/* Continuous Vitality Bar with Delayed Trailing Damage Ghost */}
          <div className="relative h-3.5 w-full rounded-sm bg-[#1f1c1a] border-2 border-[#1f1c1a] shadow-[0_2px_6px_rgba(20,16,12,0.38)] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#f59e0b] transition-all duration-300"
              style={{ width: `${ghostHpPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 transition-all duration-100"
              style={{
                width: `${hpPct}%`,
                backgroundColor: lowHp ? '#dc2626' : '#c93b2b',
              }}
            />
            <div className="absolute inset-x-0 top-0 h-[2px] bg-white/25" />
          </div>

          {/* Unboxed Quiet Metadata Line: Qinggong Dash + Combo / Perfect Dodge */}
          <div className="flex items-center gap-2.5 text-xs font-bold text-[#faf4e8] ink-stroke-text px-0.5">
            <span>
              轻功 {hud.dashReadyRatio >= 0.99 ? '就绪' : `${Math.round(hud.dashReadyRatio * 100)}%`}
            </span>
            {hud.combo >= 3 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-num text-[#facc15]">{hud.combo} 连斩</span>
              </>
            )}
            {hud.perfectDodges > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-num text-[#86efac]">破招 {hud.perfectDodges}</span>
              </>
            )}
          </div>
        </div>

        {/* Top-Center: Clock, Wave, Kills & Thin XP Progress Bar (+ Dynamic Boss Bar) */}
        <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[440px]">
          <div className="flex items-center gap-4 text-[#faf4e8] ink-stroke-text">
            <span className="text-xs font-bold tracking-wider opacity-95">
              第{hud.waveIndex}波 · {hud.waveTitle}
            </span>
            <span
              className="font-num text-xl sm:text-2xl font-bold tracking-wider"
              data-testid="hud-timer"
            >
              {formatClock(hud.elapsedSec)}
            </span>
            <span className="font-num text-xs font-bold" data-testid="hud-kills">
              斩敌 {hud.kills}
            </span>
          </div>

          {/* Xuan-Jade XP Bar + Level */}
          <div className="w-full flex items-center gap-2">
            <span
              className="font-num text-xs font-bold text-[#faf4e8] bg-[#1f1c1a] border border-[#d99b26] px-2 py-0.5 rounded-sm shrink-0"
              data-testid="hud-level"
            >
              Lv.{hud.level}
            </span>
            <div className="relative flex-1 h-2.5 rounded-sm bg-[#1f1c1a] border border-[#3d352d] overflow-hidden shadow">
              <div
                className="h-full bg-[#1e8c6e] transition-all duration-150"
                style={{ width: `${xpPct}%` }}
              />
              <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30" />
            </div>
          </div>

          {/* Dynamic Boss / Elite Health Bar (only rendered when a Boss or Elite is active) */}
          {hud.boss && (
            <div className="w-full mt-1 px-3 py-1.5 rounded-sm bg-[#1f1c1a]/90 border border-[#c93b2b] shadow-md">
              <div className="flex items-baseline justify-between text-xs mb-1">
                <span className="font-bold text-[#f8f4ea] tracking-wider">
                  {hud.boss.name}
                  <span className="ml-2 text-[11px] font-normal text-[#d6c9b4]">
                    {hud.boss.title}
                  </span>
                </span>
                <span className="font-num text-[11px] text-[#fca5a5]">
                  {hud.boss.hp}/{hud.boss.maxHp}
                </span>
              </div>
              <div className="h-2.5 w-full bg-[#362b26] rounded-xs overflow-hidden">
                <div
                  className="h-full transition-all duration-100"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.boss.hp / Math.max(1, hud.boss.maxHp)) * 100))}%`,
                    backgroundColor: hud.boss.isFinalBoss ? '#dc2626' : '#d99b26',
                  }}
                />
              </div>
            </div>
          )}

          {/* Transient Wave / Evolution / Boss Callout Banner */}
          {hud.bannerText && (
            <div
              className={`mt-1 px-4 py-1 rounded-sm border text-xs sm:text-sm font-bold tracking-widest shadow ${
                hud.bannerTone === 'crimson'
                  ? 'bg-[#7f1d1d]/95 text-[#fef2f2] border-[#fca5a5]'
                  : hud.bannerTone === 'gold'
                    ? 'bg-[#1f1c1a]/95 text-[#facc15] border-[#d99b26]'
                    : 'bg-[#1f1c1a]/90 text-[#a7f3d0] border-[#1e8c6e]'
              }`}
            >
              {hud.bannerText}
            </div>
          )}
        </div>

        {/* Top-Right: Compact Square Utility Controls (Mute [M], Pause [P], Restart [R]) */}
        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? '开启音效 [M]' : '静音 [M]'}
            title={muted ? '开启音效 (M)' : '静音 (M)'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-10 h-10 rounded-sm bg-[#f5eedf]/92 hover:bg-[#faf6ec] text-[#1f1c1a] border-2 border-[#1f1c1a] shadow-sm flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
          >
            <UtilitySvgIcon kind={muted ? 'sound_off' : 'sound_on'} className="w-5 h-5" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="暂停游戏 [P]"
            title="暂停游戏 (P / Esc)"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-10 h-10 rounded-sm bg-[#f5eedf]/92 hover:bg-[#faf6ec] text-[#1f1c1a] border-2 border-[#1f1c1a] shadow-sm flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
          >
            <UtilitySvgIcon kind="pause" className="w-5 h-5" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="重开一局 [R]"
            title="重开一局 (R)"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-10 h-10 rounded-sm bg-[#f5eedf]/92 hover:bg-[#faf6ec] text-[#1f1c1a] border-2 border-[#1f1c1a] shadow-sm flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
          >
            <UtilitySvgIcon kind="restart" className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom-Left: Compact 6 Active Weapons + 6 Passives Ink-Socket Strip */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          {/* Active Martial Arts (6 sockets) */}
          <div className="flex items-center gap-1.5" aria-label="已装备主动绝学">
            {Array.from({ length: MAX_WEAPON_SLOTS }).map((_, idx) => {
              const owned = hud.weapons[idx];
              if (!owned) {
                return (
                  <div
                    key={idx}
                    className="w-9 h-9 rounded-sm bg-[#1f1c1a]/45 border border-[#1f1c1a]/60"
                  />
                );
              }
              const def = WEAPONS[owned.id];
              return (
                <div
                  key={owned.id}
                  title={`${owned.evolved ? def.evolvedName : def.name} Lv.${owned.level}`}
                  className={`relative w-9 h-9 rounded-sm flex items-center justify-center border-2 shadow-sm ${
                    owned.evolved
                      ? 'bg-[#2a1f14] border-[#d99b26]'
                      : 'bg-[#f5eedf]/95 border-[#1f1c1a]'
                  }`}
                >
                  <WeaponSvgIcon id={owned.id} evolved={owned.evolved} className="w-6 h-6" />
                  <span
                    className={`font-num absolute -bottom-1 -right-1 text-[10px] leading-none font-bold px-1 py-0.5 rounded-xs ${
                      owned.evolved
                        ? 'bg-[#c93b2b] text-[#fef2f2]'
                        : 'bg-[#1f1c1a] text-[#faf4e8]'
                    }`}
                  >
                    {owned.evolved ? '超' : owned.level}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Inner-Qi Passives (6 compact sockets) */}
          <div className="flex items-center gap-1.5" aria-label="已习得内功心法">
            {Array.from({ length: MAX_PASSIVE_SLOTS }).map((_, idx) => {
              const owned = hud.passives[idx];
              if (!owned) {
                return (
                  <div
                    key={idx}
                    className="w-8 h-8 rounded-sm bg-[#1f1c1a]/30 border border-[#1f1c1a]/45"
                  />
                );
              }
              const def = PASSIVES[owned.id];
              return (
                <div
                  key={owned.id}
                  title={`${def.name} Lv.${owned.level}`}
                  className="relative w-8 h-8 rounded-sm bg-[#efe6d2]/95 border border-[#1f1c1a] flex items-center justify-center shadow-sm"
                >
                  <PassiveSvgIcon id={owned.id} className="w-5 h-5" />
                  <span className="font-num absolute -bottom-1 -right-1 text-[9px] leading-none font-bold px-1 py-0.5 rounded-xs bg-[#2c3531] text-[#faf4e8]">
                    {owned.level}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
