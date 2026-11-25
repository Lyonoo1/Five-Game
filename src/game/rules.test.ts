import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUpgradeChoice,
  computeComboPickupBonus,
  computeHeroStats,
  computeHitDamage,
  formatClock,
  getEligibleEvolutions,
  getWaveDirectorConfig,
  rollUpgradeChoices,
  xpRequiredForLevel,
} from './rules';
import type { OwnedPassive, OwnedWeapon } from './types';

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('XP curve scales strictly monotonically with level', () => {
  let prev = xpRequiredForLevel(1);
  for (let lvl = 2; lvl <= 20; lvl++) {
    const curr = xpRequiredForLevel(lvl);
    assert.ok(curr > prev, `Level ${lvl} XP (${curr}) should exceed level ${lvl - 1} (${prev})`);
    prev = curr;
  }
});

test('Hero stats reflect sect perks, passives, and combo pickup bonus', () => {
  const baseQingcheng = computeHeroStats('qingcheng', [], 0);
  const baseWudang = computeHeroStats('wudang', [], 0);
  assert.ok(baseWudang.maxHp > baseQingcheng.maxHp, 'Wudang should have more max HP');
  assert.ok(baseQingcheng.critChance > baseWudang.critChance, 'Qingcheng should have higher crit');

  const withPassives = computeHeroStats(
    'qingcheng',
    [
      { id: 'blood_flame', level: 3 },
      { id: 'qi_gather', level: 2 },
      { id: 'lingbo_glide', level: 2 },
    ],
    45
  );
  assert.ok(withPassives.damageMult > baseQingcheng.damageMult);
  assert.ok(withPassives.cooldownMult < baseQingcheng.cooldownMult);
  assert.ok(withPassives.pickupRadius > baseQingcheng.pickupRadius + computeComboPickupBonus(40) - 1);
});

test('Super-Evolution eligibility triggers only at weapon Lv.5 with paired passive', () => {
  const weapons: OwnedWeapon[] = [
    { id: 'flying_sword', level: 4, evolved: false, totalDamage: 0 },
  ];
  const passives: OwnedPassive[] = [{ id: 'sword_heart', level: 1 }];
  assert.deepEqual(getEligibleEvolutions(weapons, passives), []);

  weapons[0].level = 5;
  assert.deepEqual(getEligibleEvolutions(weapons, passives), ['flying_sword']);

  // Without paired passive
  assert.deepEqual(getEligibleEvolutions(weapons, [{ id: 'wind_step', level: 3 }]), []);

  // Already evolved
  weapons[0].evolved = true;
  assert.deepEqual(getEligibleEvolutions(weapons, passives), []);
});

test('rollUpgradeChoices prioritizes mythic super-evolution and respects slot limits', () => {
  const weapons: OwnedWeapon[] = [
    { id: 'flying_sword', level: 5, evolved: false, totalDamage: 0 },
  ];
  const passives: OwnedPassive[] = [{ id: 'sword_heart', level: 2 }];

  const choices = rollUpgradeChoices(weapons, passives, createSeededRng(42), 3);
  assert.equal(choices.length, 3);
  assert.equal(choices[0].kind, 'weapon_evolve');
  assert.equal(choices[0].weaponId, 'flying_sword');
  assert.equal(choices[0].isMythic, true);

  const applied = applyUpgradeChoice(weapons, passives, choices[0]);
  assert.equal(applied.weapons[0].evolved, true);
});

test('rollUpgradeChoices falls back to consumables when all 6 weapons and 6 passives are maxed', () => {
  const allWeapons: OwnedWeapon[] = [
    { id: 'flying_sword', level: 5, evolved: true, totalDamage: 0 },
    { id: 'storm_fan', level: 5, evolved: true, totalDamage: 0 },
    { id: 'taiji_chakram', level: 5, evolved: true, totalDamage: 0 },
    { id: 'thunder_talisman', level: 5, evolved: true, totalDamage: 0 },
    { id: 'flame_gourd', level: 5, evolved: true, totalDamage: 0 },
    { id: 'frost_shuriken', level: 5, evolved: true, totalDamage: 0 },
  ];
  const allPassives: OwnedPassive[] = [
    { id: 'sword_heart', level: 5 },
    { id: 'wind_step', level: 5 },
    { id: 'qiankun_art', level: 5 },
    { id: 'qi_gather', level: 5 },
    { id: 'blood_flame', level: 5 },
    { id: 'lingbo_glide', level: 5 },
  ];

  const choices = rollUpgradeChoices(allWeapons, allPassives, createSeededRng(7), 3);
  assert.equal(choices.length, 3);
  assert.ok(choices.every((c) => c.kind === 'consumable'));
});

test('Wave director keeps opening approachable and ramps multiple knobs over time', () => {
  const w1 = getWaveDirectorConfig(3);
  const w3 = getWaveDirectorConfig(60);
  const w4 = getWaveDirectorConfig(100);

  assert.equal(w1.waveIndex, 1);
  assert.equal(w1.weights.bandit, 100);
  assert.equal(w1.weights.crossbow, 0);

  assert.ok(w3.spawnInterval < w1.spawnInterval);
  assert.ok(w3.maxEnemies > w1.maxEnemies);
  assert.ok(w3.hpMult > w1.hpMult);
  assert.ok(w3.weights.charger > 0);
  assert.ok(w4.weights.venom > 0);
});

test('Damage calculation applies crit multiplier and rounds cleanly', () => {
  const stats = computeHeroStats('qingcheng', [{ id: 'blood_flame', level: 2 }], 0);
  const normal = computeHitDamage(20, stats, 0.99);
  const crit = computeHitDamage(20, stats, 0.01);

  assert.equal(normal.isCrit, false);
  assert.equal(crit.isCrit, true);
  assert.ok(crit.amount > normal.amount);
});

test('formatClock formats MM:SS cleanly', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65.9), '01:05');
  assert.equal(formatClock(180), '03:00');
});
