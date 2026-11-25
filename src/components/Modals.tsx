import React from 'react';
import { SECTS, WEAPONS } from '../game/catalog';
import { formatClock } from '../game/rules';
import type { EndRunSummary, HudSnapshot, UpgradeOption } from '../game/types';
import { PassiveSvgIcon, UtilitySvgIcon, WeaponSvgIcon } from './WuxiaIcons';

interface LevelUpModalProps {
  level: number;
  choices: UpgradeOption[];
  rerollsLeft: number;
  onSelect: (option: UpgradeOption) => void;
  onReroll: () => void;
}

export function LevelUpModal({
  level,
  choices,
  rerollsLeft,
  onSelect,
  onReroll,
}: LevelUpModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="领悟武学残卷"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#14110f]/75"
    >
      <div className="w-full max-w-[820px] rounded-md bg-[#f5eedf] border-2 border-[#1f1c1a] shadow-[0_18px_48px_rgba(0,0,0,0.55)] p-5 sm:p-7 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 border-b border-[#cfc3ac] pb-3">
          <div>
            <h2 className="font-brush text-3xl sm:text-4xl text-[#1f1c1a] tracking-wider">
              境界突破 · 第 {level} 重
            </h2>
            <p className="text-xs sm:text-sm text-[#5c5145] mt-0.5">
              择一门武学或内功心法研习（快捷键 1 / 2 / 3）
            </p>
          </div>

          <button
            type="button"
            disabled={rerollsLeft <= 0}
            onClick={onReroll}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-sm border text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
              rerollsLeft > 0
                ? 'bg-[#e8dec7] hover:bg-[#ded1b3] text-[#1f1c1a] border-[#8b7a62] cursor-pointer'
                : 'bg-[#e6dfd1] text-[#9b8f7e] border-[#cfc5b4] cursor-not-allowed'
            }`}
          >
            <UtilitySvgIcon kind="reroll" className="w-4 h-4" />
            <span>重随残卷 ({rerollsLeft})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {choices.map((opt, idx) => {
            const isMythic = Boolean(opt.isMythic);
            return (
              <button
                key={opt.uid}
                type="button"
                onClick={() => onSelect(opt)}
                className={`group text-left rounded-md p-4 border-2 flex flex-col justify-between gap-3.5 transition-transform duration-150 hover:-translate-y-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c93b2b] ${
                  isMythic
                    ? 'bg-[#231b15] text-[#faf4e8] border-[#d99b26] shadow-[0_6px_22px_rgba(217,155,38,0.28)]'
                    : 'bg-[#faf6ec] text-[#1f1c1a] border-[#b7aa94] hover:border-[#1f1c1a]'
                }`}
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`w-12 h-12 rounded-sm border-2 flex items-center justify-center shrink-0 ${
                        isMythic
                          ? 'bg-[#362618] border-[#d99b26]'
                          : 'bg-[#efe6d2] border-[#1f1c1a]'
                      }`}
                    >
                      {opt.weaponId ? (
                        <WeaponSvgIcon
                          id={opt.weaponId}
                          evolved={isMythic}
                          className="w-8 h-8"
                        />
                      ) : opt.passiveId ? (
                        <PassiveSvgIcon id={opt.passiveId} className="w-7 h-7" />
                      ) : (
                        <span className="font-brush text-xl text-[#c93b2b]">丹</span>
                      )}
                    </div>

                    <span
                      className={`font-num text-xs font-bold px-2 py-0.5 rounded-xs border ${
                        isMythic
                          ? 'bg-[#c93b2b] text-[#fef2f2] border-[#fca5a5]'
                          : 'bg-[#ebe2ce] text-[#4c4237] border-[#c4b79f]'
                      }`}
                    >
                      [{idx + 1}]
                    </span>
                  </div>

                  <div>
                    <div
                      className={`text-[11px] font-bold tracking-wider ${
                        isMythic ? 'text-[#facc15]' : 'text-[#786a59]'
                      }`}
                    >
                      {opt.subtitle}
                    </div>
                    <h3 className="text-lg font-bold mt-0.5 leading-snug">
                      {opt.title}
                    </h3>
                  </div>

                  <p
                    className={`text-xs sm:text-[13px] leading-relaxed ${
                      isMythic ? 'text-[#e5d9c3]' : 'text-[#463d34]'
                    }`}
                  >
                    {opt.description}
                  </p>
                </div>

                {opt.synergyHint && (
                  <div
                    className={`pt-2.5 border-t text-[11px] font-medium leading-snug ${
                      isMythic
                        ? 'border-[#544028] text-[#fde68a]'
                        : 'border-[#dfd5c2] text-[#8c4a1d]'
                    }`}
                  >
                    {opt.synergyHint}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onBackToTitle: () => void;
}

export function PauseModal({
  hud,
  onResume,
  onRestart,
  onBackToTitle,
}: PauseModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="游戏已暂停"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#14110f]/75"
    >
      <div className="w-full max-w-[420px] rounded-md bg-[#f5eedf] border-2 border-[#1f1c1a] shadow-[0_18px_48px_rgba(0,0,0,0.55)] p-6 flex flex-col gap-5">
        <div className="text-center border-b border-[#cfc3ac] pb-3">
          <h2 className="font-brush text-4xl text-[#1f1c1a] tracking-widest">
            暂歇江湖
          </h2>
          <p className="text-xs text-[#665a4d] mt-1">
            {SECTS[hud.sectId].name} · 第{hud.waveIndex}波 {hud.waveTitle}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-sm bg-[#ebe2ce] border border-[#cfc3ac] py-2.5 px-2">
            <div className="text-[11px] text-[#665a4d]">存活时间</div>
            <div className="font-num text-lg font-bold text-[#1f1c1a] mt-0.5">
              {formatClock(hud.elapsedSec)}
            </div>
          </div>
          <div className="rounded-sm bg-[#ebe2ce] border border-[#cfc3ac] py-2.5 px-2">
            <div className="text-[11px] text-[#665a4d]">斩敌总数</div>
            <div className="font-num text-lg font-bold text-[#1f1c1a] mt-0.5">
              {hud.kills}
            </div>
          </div>
          <div className="rounded-sm bg-[#ebe2ce] border border-[#cfc3ac] py-2.5 px-2">
            <div className="text-[11px] text-[#665a4d]">当前境界</div>
            <div className="font-num text-lg font-bold text-[#1f1c1a] mt-0.5">
              Lv.{hud.level}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 rounded-sm bg-[#c93b2b] hover:bg-[#b02e20] text-[#faf4e8] font-bold tracking-widest border border-[#7f1d1d] cursor-pointer"
          >
            继续游历
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="py-2.5 rounded-sm bg-[#e7ddc6] hover:bg-[#dcd0b5] text-[#1f1c1a] text-sm font-bold border border-[#9d8e76] cursor-pointer"
            >
              重开一局
            </button>
            <button
              type="button"
              onClick={onBackToTitle}
              className="py-2.5 rounded-sm bg-[#e7ddc6] hover:bg-[#dcd0b5] text-[#1f1c1a] text-sm font-bold border border-[#9d8e76] cursor-pointer"
            >
              返回主界面
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EndGameModalProps {
  summary: EndRunSummary;
  onPlayAgain: () => void;
  onBackToTitle: () => void;
}

export function EndGameModal({
  summary,
  onPlayAgain,
  onBackToTitle,
}: EndGameModalProps) {
  const sortedWeapons = summary.weapons
    .slice()
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .slice(0, 4);
  const topDmg = Math.max(1, sortedWeapons[0]?.totalDamage ?? 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={summary.victory ? '通关胜利' : '胜败乃兵家常事'}
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#14110f]/80"
    >
      <div className="w-full max-w-[490px] rounded-md bg-[#f5eedf] border-2 border-[#1f1c1a] shadow-[0_20px_54px_rgba(0,0,0,0.6)] p-6 flex flex-col gap-5">
        <div className="text-center border-b border-[#cfc3ac] pb-3.5">
          <h2
            className={`font-brush text-4xl sm:text-5xl tracking-widest ${
              summary.victory ? 'text-[#b45309]' : 'text-[#991b1b]'
            }`}
          >
            {summary.victory ? '名震江湖' : '力竭退隐'}
          </h2>
          <p className="text-xs sm:text-sm text-[#5c5145] mt-1">
            {summary.victory
              ? `斩杀血煞教主 · ${SECTS[summary.sectId].name}凯旋而归`
              : summary.bossRemainingPct !== null
                ? `止步血煞教主（剩余气血 ${summary.bossRemainingPct}%）`
                : `止步第 ${summary.waveReached} 波 · 最高纪录 ${formatClock(summary.bestElapsedSec)}`}
          </p>
        </div>

        {/* Key Run Metrics */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-sm bg-[#ebe2ce] border border-[#cfc3ac] py-2.5 px-2">
            <div className="text-[11px] text-[#665a4d]">存活时间</div>
            <div className="font-num text-lg font-bold text-[#1f1c1a] mt-0.5">
              {formatClock(summary.elapsedSec)}
            </div>
          </div>
          <div className="rounded-sm bg-[#ebe2ce] border border-[#cfc3ac] py-2.5 px-2">
            <div className="text-[11px] text-[#665a4d]">斩敌总数</div>
            <div className="font-num text-lg font-bold text-[#1f1c1a] mt-0.5">
              {summary.kills}
            </div>
          </div>
          <div className="rounded-sm bg-[#ebe2ce] border border-[#cfc3ac] py-2.5 px-2">
            <div className="text-[11px] text-[#665a4d]">最高连斩 / 破招</div>
            <div className="font-num text-lg font-bold text-[#1f1c1a] mt-0.5">
              {summary.maxCombo} / {summary.perfectDodges}
            </div>
          </div>
        </div>

        {/* Martial Arts Damage Breakdown */}
        {sortedWeapons.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-bold text-[#5c5145] tracking-wider">
              武学伤害榜
            </div>
            <div className="flex flex-col gap-2">
              {sortedWeapons.map((w) => {
                const def = WEAPONS[w.id];
                const pct = Math.max(4, Math.round((w.totalDamage / topDmg) * 100));
                return (
                  <div key={w.id} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-sm bg-[#ebe2ce] border border-[#b7aa94] flex items-center justify-center shrink-0">
                      <WeaponSvgIcon id={w.id} evolved={w.evolved} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-bold text-[#1f1c1a] truncate">
                          {w.evolved ? def.evolvedName : def.name}
                          <span className="ml-1.5 text-[11px] font-normal text-[#6d5f4f]">
                            {w.evolved ? '超武' : `Lv.${w.level}`}
                          </span>
                        </span>
                        <span className="font-num text-xs text-[#4c4237] shrink-0">
                          {Math.round(w.totalDamage)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-[#dfd5c2] rounded-xs overflow-hidden mt-1">
                        <div
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: w.evolved ? def.evolvedColor : def.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="flex-1 py-3 rounded-sm bg-[#c93b2b] hover:bg-[#b02e20] text-[#faf4e8] font-bold tracking-widest border border-[#7f1d1d] cursor-pointer whitespace-nowrap"
          >
            再战江湖
          </button>
          <button
            type="button"
            onClick={onBackToTitle}
            className="px-5 py-3 rounded-sm bg-[#e7ddc6] hover:bg-[#dcd0b5] text-[#1f1c1a] text-sm font-bold border border-[#9d8e76] cursor-pointer whitespace-nowrap"
          >
            返回主界面
          </button>
        </div>
      </div>
    </div>
  );
}
