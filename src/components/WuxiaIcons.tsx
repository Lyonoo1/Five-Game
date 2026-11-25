import React from 'react';
import type { PassiveId, WeaponId } from '../game/types';

export function WuxiaTitleEmblem({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 460 156"
      className={className}
      role="img"
      aria-label="侠影五千年"
    >
      {/* Brush-stroke sword horizon flourish */}
      <path
        d="M16 116 Q160 104 378 112 L422 108 L382 119 Q172 115 24 123 Z"
        fill="#1f1c1a"
        opacity="0.82"
      />
      <path
        d="M366 100 L372 126"
        stroke="#c93b2b"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Vermilion Cinnabar Seal Stamp ("侠") */}
      <g transform="translate(12, 22)">
        <rect x="2" y="3" width="48" height="48" rx="4" fill="#1b1815" opacity="0.2" />
        <rect
          x="0"
          y="0"
          width="48"
          height="48"
          rx="4"
          fill="#c93b2b"
          stroke="#8c2318"
          strokeWidth="2.5"
        />
        <rect
          x="4"
          y="4"
          width="40"
          height="40"
          rx="2"
          fill="none"
          stroke="#f5ebd6"
          strokeWidth="1.2"
          opacity="0.7"
        />
        <text
          x="24"
          y="34"
          textAnchor="middle"
          fill="#faf4e8"
          fontSize="28"
          fontWeight="900"
          style={{ fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif' }}
        >
          侠
        </text>
      </g>

      {/* Main Calligraphy Title (layered subtle ink depth) */}
      <text
        x="78"
        y="89"
        fill="#1c1917"
        opacity="0.16"
        fontSize="68"
        fontWeight="900"
        letterSpacing="4"
        style={{ fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif' }}
      >
        侠影五千年
      </text>
      <text
        x="76"
        y="86"
        fill="#1c1917"
        fontSize="68"
        fontWeight="900"
        letterSpacing="4"
        style={{ fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif' }}
      >
        侠影五千年
      </text>

      {/* Subtle Seal Subtitle */}
      <text
        x="78"
        y="142"
        fill="#574e44"
        fontSize="15"
        fontWeight="700"
        letterSpacing="5"
        style={{ fontFamily: '"Noto Serif SC", serif' }}
      >
        水墨江湖 · 绝学破阵
      </text>
    </svg>
  );
}

export function WeaponSvgIcon({
  id,
  evolved = false,
  className = 'w-6 h-6',
}: {
  id: WeaponId;
  evolved?: boolean;
  className?: string;
}) {
  const stroke = '#1f1c1a';
  const accent = evolved ? '#d99b26' : '#f8f4ea';

  switch (id) {
    case 'flying_sword':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M19 4L14 13L11 10L19 4Z"
            fill={evolved ? '#facc15' : '#2c8a7a'}
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M12.5 11.5L5 19" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M9 12L12 15" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'storm_fan':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 19L4 9A11 11 0 0 1 20 9Z"
            fill={evolved ? '#dc2626' : '#f3ebd8'}
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 9.5A8 8 0 0 1 17.5 9.5"
            fill="none"
            stroke={evolved ? '#facc15' : '#c93b2b'}
            strokeWidth="2.2"
          />
          <path d="M12 19L12 8" stroke={stroke} strokeWidth="1.3" />
        </svg>
      );
    case 'taiji_chakram':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="#1f1c1a" stroke={evolved ? '#d99b26' : stroke} strokeWidth="1.8" />
          <path d="M12 3.5A8.5 8.5 0 0 1 12 20.5A4.25 4.25 0 0 1 12 12A4.25 4.25 0 0 0 12 3.5Z" fill="#f8f4ea" />
          <circle cx="12" cy="7.75" r="1.4" fill="#1f1c1a" />
          <circle cx="12" cy="16.25" r="1.4" fill="#f8f4ea" />
        </svg>
      );
    case 'thunder_talisman':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="3" width="12" height="18" rx="1.5" fill="#fef3c7" stroke={stroke} strokeWidth="1.8" />
          <path
            d="M13.5 6L9.5 12.5H13L10.5 18L15 11H11.8L13.5 6Z"
            fill={evolved ? '#dc2626' : '#d99b26'}
            stroke={stroke}
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'flame_gourd':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 4C9.8 4 8.5 5.6 9.3 7.5C7 8.8 6 11.5 6.8 14.8C7.6 18 9.6 20 12 20C14.4 20 16.4 18 17.2 14.8C18 11.5 17 8.8 14.7 7.5C15.5 5.6 14.2 4 12 4Z"
            fill={evolved ? '#dc2626' : '#ea580c'}
            stroke={stroke}
            strokeWidth="1.8"
          />
          <path d="M9.5 9.5H14.5" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'frost_shuriken':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 2.5L14.5 9.5L21.5 12L14.5 14.5L12 21.5L9.5 14.5L2.5 12L9.5 9.5Z"
            fill={evolved ? '#38bdf8' : '#e0f2fe'}
            stroke="#1e3a8a"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2" fill="#1e3a8a" />
        </svg>
      );
  }
}

export function PassiveSvgIcon({
  id,
  className = 'w-5 h-5',
}: {
  id: PassiveId;
  className?: string;
}) {
  const stroke = '#1f1c1a';
  switch (id) {
    case 'sword_heart':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M12 3L19 12L12 21L5 12Z" fill="#2c8a7a" stroke={stroke} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.8" fill="#f8f4ea" />
        </svg>
      );
    case 'wind_step':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 9H16A3 3 0 1 0 13 6" fill="none" stroke="#c93b2b" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M3 14H19A2.5 2.5 0 1 1 16.5 16.5" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'qiankun_art':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" fill="#e7e0d0" stroke={stroke} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.5" fill="#374151" />
        </svg>
      );
    case 'qi_gather':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="#fef3c7" stroke={stroke} strokeWidth="1.8" />
          <path d="M12 6V12L16 14" stroke="#c2871e" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'blood_flame':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 3C15 7.5 18 10 18 14A6 6 0 1 1 6 14C6 10 9 7.5 12 3Z"
            fill="#d9532f"
            stroke={stroke}
            strokeWidth="1.8"
          />
          <path d="M12 10.5C13.5 12.5 14.5 13.8 14.5 15.2A2.5 2.5 0 1 1 9.5 15.2C9.5 13.8 10.5 12.5 12 10.5Z" fill="#facc15" />
        </svg>
      );
    case 'lingbo_glide':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 17C8 17 11 11 19 7" fill="none" stroke="#2b6cb0" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M7 20C11 20 14 15 20 12" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

export function UtilitySvgIcon({
  kind,
  className = 'w-5 h-5',
}: {
  kind: 'sound_on' | 'sound_off' | 'pause' | 'restart' | 'reroll';
  className?: string;
}) {
  switch (kind) {
    case 'sound_on':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      );
    case 'sound_off':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      );
    case 'pause':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case 'restart':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case 'reroll':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      );
  }
}
