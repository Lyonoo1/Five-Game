import React, { useState } from 'react';
import { SECT_LIST } from '../game/catalog';
import { formatClock } from '../game/rules';
import type { SectId } from '../game/types';
import { WeaponSvgIcon, WuxiaTitleEmblem } from './WuxiaIcons';

const TITLE_ART_URL = '/src/assets/images/wuxia_title_bg_1795577565438.jpg';

interface TitleScreenProps {
  selectedSect: SectId;
  bestElapsedSec: number;
  onSelectSect: (sect: SectId) => void;
  onStart: () => void;
}

const DRIFT_LEAVES = [
  { left: '62%', dur: '11s', delay: '0s', color: '#c95b2b' },
  { left: '78%', dur: '14s', delay: '-3s', color: '#b45309' },
  { left: '88%', dur: '12.5s', delay: '-6s', color: '#c93b2b' },
  { left: '52%', dur: '15s', delay: '-9s', color: '#4d7c59' },
];

export function TitleScreen({
  selectedSect,
  bestElapsedSec,
  onSelectSect,
  onStart,
}: TitleScreenProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <main
      className="fixed inset-0 z-20 flex flex-col justify-between overflow-hidden bg-[#efe8d8]"
      aria-label="侠影五千年 主界面"
    >
      {/* Full-Bleed Illustrated Key-Art Backdrop with Resilient Fallback */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {!imgFailed ? (
          <img
            src={TITLE_ART_URL}
            alt="水墨竹林山峰间的侠客背影插画"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-right"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at 76% 42%, #d8d0bc 0%, #ebe3d1 55%, #f5efe2 100%)',
            }}
          />
        )}

        {/* Measured subtle left-side Xuan-paper scrim so typography remains effortlessly legible on narrow viewports */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(246,240,226,0.92) 0%, rgba(246,240,226,0.72) 34%, rgba(246,240,226,0.12) 58%, rgba(246,240,226,0) 100%)',
          }}
        />

        {/* Subtle ambient drifting maple leaves */}
        {DRIFT_LEAVES.map((leaf, i) => (
          <svg
            key={i}
            viewBox="0 0 20 12"
            className="animate-leaf-drift absolute top-0 w-4 h-3"
            style={
              {
                left: leaf.left,
                '--leaf-dur': leaf.dur,
                '--leaf-delay': leaf.delay,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <ellipse cx="10" cy="6" rx="8" ry="3.5" fill={leaf.color} opacity="0.72" />
          </svg>
        ))}
      </div>

      {/* Left-Third Focal Lockup Over Calm Negative Space */}
      <div className="relative z-10 flex-1 flex items-center px-8 sm:px-14 lg:px-20 pt-8 pb-6">
        <div className="w-full max-w-[476px] flex flex-col gap-7">
          {/* Bespoke SVG Title Lockup */}
          <div className="w-full">
            <WuxiaTitleEmblem className="w-full max-w-[410px] h-auto" />
          </div>

          {/* Sect Selector (Compact 3-choice segmented selector) */}
          <section aria-label="选择初始门派" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-bold tracking-widest text-[#5c5145]">
              <span>选择初入江湖门派</span>
              {bestElapsedSec > 0 && (
                <span className="font-num text-[#8c4a1d]">
                  最高存活 {formatClock(bestElapsedSec)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="门派列表">
              {SECT_LIST.map((sect) => {
                const active = selectedSect === sect.id;
                return (
                  <button
                    key={sect.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSelectSect(sect.id)}
                    className={`group flex flex-col items-start gap-1.5 px-3 py-2.5 rounded-md border text-left transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c93b2b] cursor-pointer ${
                      active
                        ? 'bg-[#1f1c1a] text-[#f8f4ea] border-[#1f1c1a] shadow-md -translate-y-0.5'
                        : 'bg-[#f8f3e6]/90 text-[#2b2520] border-[#b7aa94] hover:border-[#6e604f]'
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span
                        className={`w-7 h-7 rounded flex items-center justify-center shrink-0 border ${
                          active
                            ? 'bg-[#f5ebd6] border-[#d99b26]'
                            : 'bg-[#ebe2ce] border-[#c4b79f]'
                        }`}
                      >
                        <WeaponSvgIcon id={sect.startWeapon} className="w-5 h-5" />
                      </span>
                      <span className="text-sm font-bold whitespace-nowrap leading-tight">
                        {sect.name}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] leading-snug ${
                        active ? 'text-[#e2d4b8]' : 'text-[#685c4f]'
                      }`}
                    >
                      {sect.perkLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Primary Start CTA */}
          <div className="flex items-center gap-4 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="px-9 py-3.5 rounded-md bg-[#c93b2b] hover:bg-[#b02e20] active:scale-[0.98] text-[#faf5ea] text-lg font-bold tracking-[0.22em] border-2 border-[#7f1d1d] shadow-[0_6px_18px_rgba(127,29,29,0.32)] transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f1c1a]"
            >
              踏入江湖
            </button>
            <span className="text-xs font-medium text-[#5c5145]">
              按 Enter / 空格 开始
            </span>
          </div>
        </div>
      </div>

      {/* Single Flat Borderless Control Hint Line in Bottom Safe Margin */}
      <footer className="relative z-10 px-8 sm:px-14 lg:px-20 pb-5 pt-2">
        <p className="text-xs font-medium tracking-wider text-[#52473c]">
          WASD / 方向键 移动 · 空格 轻功闪避与身法破招 · 1 / 2 / 3 领悟绝学 · P / Esc 暂停 · M 静音
        </p>
      </footer>
    </main>
  );
}
