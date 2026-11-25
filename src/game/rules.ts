import {
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  PASSIVES,
  PASSIVE_LIST,
  SECTS,
  WEAPONS,
  WEAPON_LIST,
} from './catalog';
import type {
  ComputedHeroStats,
  OwnedPassive,
  OwnedWeapon,
  PassiveId,
  SectId,
  UpgradeOption,
  WaveDirectorConfig,
  WeaponId,
} from './types';

export function xpRequiredForLevel(level: number): number {
  const safeLvl = Math.max(1, Math.floor(level));
  if (safeLvl <= 1) return 18;
  return Math.round(18 + (safeLvl - 1) * 14 + Math.pow(safeLvl - 1, 1.48) * 5);
}

export function computeComboPickupBonus(combo: number): number {
  if (combo <= 0) return 0;
  return Math.min(72, Math.floor(combo / 10) * 10);
}

export function computeHeroStats(
  sectId: SectId,
  passives: OwnedPassive[],
  combo: number
): ComputedHeroStats {
  const sect = SECTS[sectId];
  const passiveLvl = (id: PassiveId): number =>
    passives.find((p) => p.id === id)?.level ?? 0;

  const swordHeart = passiveLvl('sword_heart');
  const windStep = passiveLvl('wind_step');
  const qiankun = passiveLvl('qiankun_art');
  const qiGather = passiveLvl('qi_gather');
  const bloodFlame = passiveLvl('blood_flame');
  const lingbo = passiveLvl('lingbo_glide');

  const maxHp = 110 + sect.bonusHp;
  const moveSpeed = 208 * (1 + sect.bonusSpeed + lingbo * 0.1);
  const damageMult = 1 + sect.bonusDamage + bloodFlame * 0.15;
  const cooldownMult = Math.max(0.45, 1 - qiGather * 0.09 - windStep * 0.035);
  const areaMult = 1 + qiankun * 0.13;
  const critChance = Math.min(0.75, 0.08 + sect.bonusCrit + swordHeart * 0.08);
  const critMult = 1.65 + swordHeart * 0.12;
  const pickupRadius = 86 * (1 + lingbo * 0.18) + computeComboPickupBonus(combo);
  const projSpeedMult = 1 + windStep * 0.14;
  const dashCooldown = Math.max(1.2, 2.35 * (1 - qiGather * 0.07));

  return {
    maxHp,
    moveSpeed,
    damageMult,
    cooldownMult,
    areaMult,
    critChance,
    critMult,
    pickupRadius,
    projSpeedMult,
    dashCooldown,
  };
}

export function getEligibleEvolutions(
  weapons: OwnedWeapon[],
  passives: OwnedPassive[]
): WeaponId[] {
  const passiveSet = new Set(passives.map((p) => p.id));
  const result: WeaponId[] = [];
  for (const w of weapons) {
    if (w.evolved) continue;
    const def = WEAPONS[w.id];
    if (w.level >= def.maxLevel && passiveSet.has(def.pairedPassive)) {
      result.push(w.id);
    }
  }
  return result;
}

export function rollUpgradeChoices(
  weapons: OwnedWeapon[],
  passives: OwnedPassive[],
  rng: () => number = Math.random,
  count = 3
): UpgradeOption[] {
  const weaponMap = new Map(weapons.map((w) => [w.id, w]));
  const passiveMap = new Map(passives.map((p) => [p.id, p]));
  const pool: UpgradeOption[] = [];

  // 1. Eligible Mythic Super-Evolutions (highest priority!)
  const eligibleEvos = getEligibleEvolutions(weapons, passives);
  const evoOptions: UpgradeOption[] = eligibleEvos.map((wid) => {
    const def = WEAPONS[wid];
    const paired = PASSIVES[def.pairedPassive];
    return {
      uid: `evolve_${wid}`,
      kind: 'weapon_evolve',
      weaponId: wid,
      title: def.evolvedName,
      subtitle: `绝世超武 · ${def.name}突破`,
      description: def.evolvedDescription,
      synergyHint: `已集齐【${def.name} Lv.5 + ${paired.name}】`,
      accentColor: def.evolvedColor,
      isMythic: true,
    };
  });

  // 2. Active Weapons (upgrade existing < maxLevel, or add new if slot available)
  for (const def of WEAPON_LIST) {
    const owned = weaponMap.get(def.id);
    const paired = PASSIVES[def.pairedPassive];
    const hasPaired = passiveMap.has(def.pairedPassive);
    const synergyHint = hasPaired
      ? `羁绊就绪：已习得【${paired.name}】→ 满级合成【${def.evolvedName}】`
      : `超武羁绊：配【${paired.name}】→ 合成【${def.evolvedName}】`;

    if (owned) {
      if (!owned.evolved && owned.level < def.maxLevel) {
        const nextLevel = owned.level + 1;
        pool.push({
          uid: `w_up_${def.id}_${nextLevel}`,
          kind: 'weapon_up',
          weaponId: def.id,
          title: def.name,
          subtitle: `主动绝学 · Lv.${owned.level} → Lv.${nextLevel}`,
          description: def.levelDescriptions[nextLevel - 1] ?? def.roleTag,
          nextLevel,
          maxLevel: def.maxLevel,
          synergyHint,
          accentColor: def.color,
        });
      }
    } else if (weapons.length < MAX_WEAPON_SLOTS) {
      pool.push({
        uid: `w_new_${def.id}`,
        kind: 'weapon_new',
        weaponId: def.id,
        title: def.name,
        subtitle: `新习绝学 · ${def.roleTag}`,
        description: def.levelDescriptions[0],
        nextLevel: 1,
        maxLevel: def.maxLevel,
        synergyHint,
        accentColor: def.color,
      });
    }
  }

  // 3. Inner-Qi Passives (upgrade existing < maxLevel, or add new if slot available)
  for (const pdef of PASSIVE_LIST) {
    const owned = passiveMap.get(pdef.id);
    const pairedW = WEAPONS[pdef.pairedWeapon];
    const hasPairedWeapon = weaponMap.has(pdef.pairedWeapon);
    const synergyHint = hasPairedWeapon
      ? `激活羁绊：助力【${pairedW.name}】突破【${pairedW.evolvedName}】`
      : `配对绝学：【${pairedW.name}】`;

    if (owned) {
      if (owned.level < pdef.maxLevel) {
        const nextLevel = owned.level + 1;
        pool.push({
          uid: `p_up_${pdef.id}_${nextLevel}`,
          kind: 'passive_up',
          passiveId: pdef.id,
          title: pdef.name,
          subtitle: `内功心法 · Lv.${owned.level} → Lv.${nextLevel}`,
          description: pdef.perLevelDescription,
          nextLevel,
          maxLevel: pdef.maxLevel,
          synergyHint,
          accentColor: pdef.color,
        });
      }
    } else if (passives.length < MAX_PASSIVE_SLOTS) {
      pool.push({
        uid: `p_new_${pdef.id}`,
        kind: 'passive_new',
        passiveId: pdef.id,
        title: pdef.name,
        subtitle: `新习心法 · ${pdef.roleTag}`,
        description: pdef.perLevelDescription,
        nextLevel: 1,
        maxLevel: pdef.maxLevel,
        synergyHint,
        accentColor: pdef.color,
      });
    }
  }

  // Deterministic Fisher-Yates shuffle with provided rng
  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const chosen: UpgradeOption[] = [];
  // Always surface eligible Mythic Super-Evolutions first
  for (const evo of shuffle(evoOptions)) {
    if (chosen.length < count) chosen.push(evo);
  }

  // Weight items that already have synergy with owned build slightly higher by shuffling synergy-matched first half
  const shuffledPool = shuffle(pool);
  for (const opt of shuffledPool) {
    if (chosen.length >= count) break;
    chosen.push(opt);
  }

  // Fallback consumables if everything is maxed out
  const fallbacks: UpgradeOption[] = [
    {
      uid: 'consumable_heal',
      kind: 'consumable',
      title: '九花玉露丸',
      subtitle: '江湖灵药 · 恢复状态',
      description: '立刻恢复 45 点气血，并释放一圈震退群敌的真气波。',
      accentColor: '#1e8c6e',
    },
    {
      uid: 'consumable_might',
      kind: 'consumable',
      title: '百年陈酿',
      subtitle: '江湖奇遇 · 真气灌体',
      description: '立刻恢复 25 点气血，并吸取全场所有散落真气珠。',
      accentColor: '#d99b26',
    },
    {
      uid: 'consumable_clarity',
      kind: 'consumable',
      title: '清心灵符',
      subtitle: '江湖灵药 · 轻功瞬复',
      description: '立刻恢复 30 点气血，且轻功冷却立即清零。',
      accentColor: '#c93b2b',
    },
  ];

  let fbIdx = 0;
  while (chosen.length < count && fbIdx < fallbacks.length) {
    chosen.push(fallbacks[fbIdx++]);
  }

  return chosen;
}

export function getWaveDirectorConfig(elapsedSec: number): WaveDirectorConfig {
  const t = Math.max(0, elapsedSec);

  if (t < 15) {
    // Opening grace period: approachable bandits only, gentle cadence
    return {
      waveIndex: 1,
      waveTitle: '初入竹林',
      spawnInterval: 1.05,
      maxEnemies: 18,
      hpMult: 0.85,
      speedMult: 0.92,
      weights: { bandit: 100, crossbow: 0, charger: 0, venom: 0 },
    };
  }
  if (t < 42) {
    return {
      waveIndex: 2,
      waveTitle: '暗弩伏击',
      spawnInterval: 0.72,
      maxEnemies: 34,
      hpMult: 1.1,
      speedMult: 1.0,
      weights: { bandit: 70, crossbow: 30, charger: 0, venom: 0 },
    };
  }
  if (t < 85) {
    return {
      waveIndex: 3,
      waveTitle: '铁骑破阵',
      spawnInterval: 0.52,
      maxEnemies: 52,
      hpMult: 1.48,
      speedMult: 1.08,
      weights: { bandit: 48, crossbow: 26, charger: 26, venom: 0 },
    };
  }
  if (t < 135) {
    return {
      waveIndex: 4,
      waveTitle: '毒雾围城',
      spawnInterval: 0.4,
      maxEnemies: 68,
      hpMult: 1.95,
      speedMult: 1.14,
      weights: { bandit: 34, crossbow: 22, charger: 22, venom: 22 },
    };
  }

  return {
    waveIndex: 5,
    waveTitle: '血煞降临',
    spawnInterval: 0.48,
    maxEnemies: 58,
    hpMult: 2.35,
    speedMult: 1.18,
    weights: { bandit: 32, crossbow: 24, charger: 24, venom: 20 },
  };
}

export function computeHitDamage(
  baseDamage: number,
  stats: ComputedHeroStats,
  critRoll: number
): { amount: number; isCrit: boolean } {
  const isCrit = critRoll < stats.critChance;
  const raw = baseDamage * stats.damageMult * (isCrit ? stats.critMult : 1);
  return {
    amount: Math.max(1, Math.round(raw)),
    isCrit,
  };
}

export function applyUpgradeChoice(
  weapons: OwnedWeapon[],
  passives: OwnedPassive[],
  option: UpgradeOption
): { weapons: OwnedWeapon[]; passives: OwnedPassive[] } {
  const nextWeapons = weapons.map((w) => ({ ...w }));
  const nextPassives = passives.map((p) => ({ ...p }));

  if (option.kind === 'weapon_new' && option.weaponId) {
    if (!nextWeapons.some((w) => w.id === option.weaponId) && nextWeapons.length < MAX_WEAPON_SLOTS) {
      nextWeapons.push({ id: option.weaponId, level: 1, evolved: false, totalDamage: 0 });
    }
  } else if (option.kind === 'weapon_up' && option.weaponId) {
    const target = nextWeapons.find((w) => w.id === option.weaponId);
    if (target) {
      target.level = Math.min(WEAPONS[target.id].maxLevel, target.level + 1);
    }
  } else if (option.kind === 'weapon_evolve' && option.weaponId) {
    const target = nextWeapons.find((w) => w.id === option.weaponId);
    if (target) {
      target.level = WEAPONS[target.id].maxLevel;
      target.evolved = true;
    }
  } else if (option.kind === 'passive_new' && option.passiveId) {
    if (!nextPassives.some((p) => p.id === option.passiveId) && nextPassives.length < MAX_PASSIVE_SLOTS) {
      nextPassives.push({ id: option.passiveId, level: 1 });
    }
  } else if (option.kind === 'passive_up' && option.passiveId) {
    const target = nextPassives.find((p) => p.id === option.passiveId);
    if (target) {
      target.level = Math.min(PASSIVES[target.id].maxLevel, target.level + 1);
    }
  }

  return { weapons: nextWeapons, passives: nextPassives };
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
