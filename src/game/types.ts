export type GamePhase = 'title' | 'playing' | 'levelup' | 'paused' | 'gameover';

export type SectId = 'qingcheng' | 'xiaoyao' | 'wudang';

export type WeaponId =
  | 'flying_sword'
  | 'storm_fan'
  | 'taiji_chakram'
  | 'thunder_talisman'
  | 'flame_gourd'
  | 'frost_shuriken';

export type PassiveId =
  | 'sword_heart'
  | 'wind_step'
  | 'qiankun_art'
  | 'qi_gather'
  | 'blood_flame'
  | 'lingbo_glide';

export type EnemyArchetype =
  | 'bandit'
  | 'crossbow'
  | 'charger'
  | 'venom'
  | 'elite_guard'
  | 'boss_bloodlord';

export interface SectDef {
  id: SectId;
  name: string;
  title: string;
  startWeapon: WeaponId;
  perkLabel: string;
  robeColor: string;
  trimColor: string;
  scarfColor: string;
  bonusHp: number;
  bonusSpeed: number;
  bonusCrit: number;
  bonusDamage: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  evolvedName: string;
  pairedPassive: PassiveId;
  roleTag: string;
  color: string;
  evolvedColor: string;
  maxLevel: number;
  baseDamage: number;
  baseCooldown: number;
  levelDescriptions: string[];
  evolvedDescription: string;
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  pairedWeapon: WeaponId;
  roleTag: string;
  color: string;
  maxLevel: number;
  perLevelDescription: string;
}

export interface OwnedWeapon {
  id: WeaponId;
  level: number; // 1..5
  evolved: boolean;
  totalDamage: number;
}

export interface OwnedPassive {
  id: PassiveId;
  level: number; // 1..5
}

export type UpgradeOptionKind = 'weapon_new' | 'weapon_up' | 'weapon_evolve' | 'passive_new' | 'passive_up' | 'consumable';

export interface UpgradeOption {
  uid: string;
  kind: UpgradeOptionKind;
  weaponId?: WeaponId;
  passiveId?: PassiveId;
  title: string;
  subtitle: string;
  description: string;
  nextLevel?: number;
  maxLevel?: number;
  synergyHint?: string;
  accentColor: string;
  isMythic?: boolean;
}

export interface ComputedHeroStats {
  maxHp: number;
  moveSpeed: number;
  damageMult: number;
  cooldownMult: number;
  areaMult: number;
  critChance: number;
  critMult: number;
  pickupRadius: number;
  projSpeedMult: number;
  dashCooldown: number;
}

export interface WaveDirectorConfig {
  waveIndex: number;
  waveTitle: string;
  spawnInterval: number;
  maxEnemies: number;
  hpMult: number;
  speedMult: number;
  weights: Record<'bandit' | 'crossbow' | 'charger' | 'venom', number>;
}

export interface ActiveBossHud {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  isFinalBoss: boolean;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  elapsedSec: number;
  kills: number;
  combo: number;
  maxCombo: number;
  perfectDodges: number;
  rerollsLeft: number;
  waveIndex: number;
  waveTitle: string;
  sectId: SectId;
  weapons: OwnedWeapon[];
  passives: OwnedPassive[];
  boss: ActiveBossHud | null;
  bannerText: string | null;
  bannerTone: 'gold' | 'crimson' | 'jade';
  dashReadyRatio: number; // 0..1
}

export interface EndRunSummary {
  victory: boolean;
  sectId: SectId;
  elapsedSec: number;
  bestElapsedSec: number;
  kills: number;
  level: number;
  maxCombo: number;
  perfectDodges: number;
  waveReached: number;
  bossRemainingPct: number | null;
  weapons: OwnedWeapon[];
  passives: OwnedPassive[];
}
