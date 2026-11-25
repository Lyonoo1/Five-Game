import { WuxiaSoundEngine } from './audio';
import {
  BOSS_SPAWN_SEC,
  ELITE_SPAWN_TIMES,
  SECTS,
  STAGE_DURATION_SEC,
  WEAPONS,
} from './catalog';
import {
  applyUpgradeChoice,
  computeHeroStats,
  computeHitDamage,
  getWaveDirectorConfig,
  rollUpgradeChoices,
  xpRequiredForLevel,
} from './rules';
import type {
  ActiveBossHud,
  ComputedHeroStats,
  EndRunSummary,
  EnemyArchetype,
  GamePhase,
  HudSnapshot,
  OwnedPassive,
  OwnedWeapon,
  SectId,
  UpgradeOption,
  WeaponId,
} from './types';

interface Vec2 {
  x: number;
  y: number;
}

interface EnemyEntity {
  id: number;
  archetype: EnemyArchetype;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  xpValue: number;
  hitFlash: number;
  slowTimer: number;
  walkPhase: number;
  facing: number;
  // State machine for distinct policies & telegraphs
  aiState: 'move' | 'windup' | 'attack' | 'recover';
  aiTimer: number;
  aimAngle: number;
  orbitDir: number;
  hasToken: boolean;
  // KO transition (0.3s topple/dissolve)
  dying: boolean;
  koTimer: number;
  koVx: number;
  koVy: number;
  // Boss / Elite extras
  bossPattern: number;
  isBoss: boolean;
  isElite: boolean;
  displayName?: string;
  displayTitle?: string;
}

interface PlayerProjectile {
  id: number;
  weaponId: WeaponId;
  evolved: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  life: number;
  maxLife: number;
  rotation: number;
  spinSpeed: number;
  boomerang?: boolean;
  returning?: boolean;
  slowAmount?: number;
  hitIds: Set<number>;
  prevX: number;
  prevY: number;
}

interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  color: string;
  dodged: boolean;
}

interface GroundZone {
  kind: 'player_fire' | 'enemy_venom' | 'enemy_slam';
  weaponId?: WeaponId;
  evolved?: boolean;
  x: number;
  y: number;
  radius: number;
  damage: number;
  windup: number; // > 0 means still telegraphing
  maxWindup: number;
  life: number;
  maxLife: number;
  tickTimer: number;
  triggered: boolean;
  dodged: boolean;
}

interface LightningFx {
  x: number;
  y: number;
  radius: number;
  timer: number;
  maxTimer: number;
  evolved: boolean;
  chainFromX?: number;
  chainFromY?: number;
}

interface PickupEntity {
  kind: 'xp_small' | 'xp_mid' | 'xp_gold' | 'bun_heal' | 'magnet' | 'scroll';
  x: number;
  y: number;
  value: number;
  magnetized: boolean;
  bobPhase: number;
}

interface BreakableProp {
  id: number;
  kind: 'jar' | 'chest';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'dot' | 'slash' | 'ring' | 'leaf';
  angle: number;
  spin: number;
}

interface FloatingTextSlot {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface AfterimageSlot {
  active: boolean;
  x: number;
  y: number;
  facing: number;
  life: number;
  maxLife: number;
  color: string;
}

interface AmbientLeaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  color: string;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onLevelUpChoices: (choices: UpgradeOption[], rerollsLeft: number) => void;
  onRunFinished: (summary: EndRunSummary) => void;
}

const MAX_PARTICLES = 480;
const MAX_FLOATING_TEXTS = 96;
const MAX_AFTERIMAGES = 24;
const MAX_ATTACK_TOKENS = 3;
const BEST_TIME_KEY = 'wuxia5000_best_time_v1';

export class WuxiaGameEngine {
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;
  public readonly sound = new WuxiaSoundEngine();

  private rafId: number | null = null;
  private yieldTimerId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private width = 1280;
  private height = 720;
  private dpr = 1;
  private lastFrameMs = 0;
  private floorPattern: CanvasPattern | null = null;
  private needsStaticRedraw = true;

  // Phase & simulation timing
  private phase: GamePhase = 'title';
  private hitstopTimer = 0;
  private trauma = 0;
  private shakeX = 0;
  private shakeY = 0;
  private hudSyncTimer = 0;
  private defeatBeatTimer = 0;
  private pendingDefeat = false;
  private nextEntityId = 1;

  // Camera
  private camX = 0;
  private camY = 0;

  // Input state (continuous held vs edge-triggered buffered dash)
  private keysHeld = new Set<string>();
  private dashBufferTimer = 0;
  private pointerActive = false;
  private pointerScreenX = 0;
  private pointerScreenY = 0;

  // Hero state
  private sectId: SectId = 'qingcheng';
  private heroX = 0;
  private heroY = 0;
  private heroFacing = 1;
  private heroAimAngle = 0;
  private heroWalkPhase = 0;
  private heroScaleX = 1;
  private heroScaleY = 1;
  private heroHp = 110;
  private heroMaxHp = 110;
  private heroInvuln = 0;
  private heroHitFlash = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private dashDirX = 1;
  private dashDirY = 0;
  private perfectDodgeTriggeredThisDash = false;
  private scarfNodes: Vec2[] = [];

  // Progression & Run state
  private elapsedSec = 0;
  private xp = 0;
  private xpNext = xpRequiredForLevel(1);
  private level = 1;
  private kills = 0;
  private combo = 0;
  private comboTimer = 0;
  private maxCombo = 0;
  private perfectDodges = 0;
  private rerollsLeft = 2;
  private weapons: OwnedWeapon[] = [];
  private passives: OwnedPassive[] = [];
  private weaponCooldowns = new Map<WeaponId, number>();
  private taijiAngle = 0;
  private taijiHitCooldowns = new Map<number, number>();
  private stats: ComputedHeroStats = computeHeroStats('qingcheng', [], 0);
  private pendingUpgradeChoices: UpgradeOption[] = [];

  // Wave & Spawning
  private spawnTimer = 0.6;
  private propSpawnTimer = 5.0;
  private spawnedEliteFlags: boolean[] = [false, false];
  private bossSpawned = false;
  private bossDefeated = false;
  private activeAttackTokens = 0;
  private bannerText: string | null = null;
  private bannerTone: 'gold' | 'crimson' | 'jade' = 'gold';
  private bannerTimer = 0;
  private lastWaveAnnounced = 1;

  // Active Entities
  private enemies: EnemyEntity[] = [];
  private playerProjectiles: PlayerProjectile[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private groundZones: GroundZone[] = [];
  private lightnings: LightningFx[] = [];
  private pickups: PickupEntity[] = [];
  private breakables: BreakableProp[] = [];
  private ambientLeaves: AmbientLeaf[] = [];

  // Zero-GC Pools
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private floatingTexts: FloatingTextSlot[] = [];
  private textCursor = 0;
  private afterimages: AfterimageSlot[] = [];
  private afterimageCursor = 0;

  // Bound listeners for cleanup
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundBlur: () => void;
  private boundVisibility: () => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: () => void;

  constructor(host: HTMLElement, callbacks: EngineCallbacks) {
    this.host = host;
    this.callbacks = callbacks;

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-testid', 'game-canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.tabIndex = 0;
    this.host.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = ctx;

    // Pre-allocate zero-GC pools
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 4,
        life: 0,
        maxLife: 1,
        color: '#231f20',
        shape: 'dot',
        angle: 0,
        spin: 0,
      });
    }
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      this.floatingTexts.push({
        active: false,
        x: 0,
        y: 0,
        vy: -40,
        text: '',
        color: '#ffffff',
        size: 16,
        life: 0,
        maxLife: 0.7,
      });
    }
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      this.afterimages.push({
        active: false,
        x: 0,
        y: 0,
        facing: 1,
        life: 0,
        maxLife: 0.24,
        color: '#231f20',
      });
    }
    for (let i = 0; i < 24; i++) {
      this.ambientLeaves.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1000,
        vx: -18 - Math.random() * 24,
        vy: 14 + Math.random() * 20,
        size: 4 + Math.random() * 4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2.5,
        color: Math.random() > 0.4 ? '#c95b2b' : '#4a7c59',
      });
    }

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundBlur = this.clearAllInputs.bind(this);
    this.boundVisibility = () => {
      if (document.hidden) this.clearAllInputs();
    };
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = () => {
      this.pointerActive = false;
    };

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.host);
    this.buildFloorPattern();
    this.handleResize();

    this.resetWorldState('qingcheng');
    this.lastFrameMs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private buildFloorPattern(): void {
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = 288;
    tileCanvas.height = 288;
    const tctx = tileCanvas.getContext('2d');
    if (!tctx) return;

    const step = 96;
    for (let gx = 0; gx < 3; gx++) {
      for (let gy = 0; gy < 3; gy++) {
        const x = gx * step;
        const y = gy * step;
        const hash = (gx * 7 + gy * 13) % 5;
        tctx.fillStyle = hash === 0 ? '#c7bfae' : hash === 2 ? '#d4ccb9' : '#cec6b5';
        tctx.fillRect(x, y, step, step);
        tctx.strokeStyle = 'rgba(72, 64, 52, 0.14)';
        tctx.lineWidth = 1;
        tctx.strokeRect(x + 0.5, y + 0.5, step - 1, step - 1);

        if (gx === 1 && gy === 0) {
          tctx.fillStyle = 'rgba(65, 108, 78, 0.22)';
          tctx.beginPath();
          tctx.ellipse(x + 26, y + 32, 14, 7, 0.3, 0, Math.PI * 2);
          tctx.fill();
        } else if (gx === 2 && gy === 2) {
          tctx.strokeStyle = 'rgba(42, 68, 52, 0.16)';
          tctx.lineWidth = 3;
          tctx.beginPath();
          tctx.moveTo(x + 62, y + 84);
          tctx.lineTo(x + 68, y + 18);
          tctx.stroke();
          tctx.fillStyle = 'rgba(48, 86, 62, 0.16)';
          tctx.beginPath();
          tctx.ellipse(x + 54, y + 34, 14, 3.5, -0.5, 0, Math.PI * 2);
          tctx.ellipse(x + 78, y + 42, 13, 3.5, 0.4, 0, Math.PI * 2);
          tctx.fill();
        }
      }
    }
    this.floorPattern = this.ctx.createPattern(tileCanvas, 'repeat');
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.yieldTimerId !== null) {
      window.clearTimeout(this.yieldTimerId);
      this.yieldTimerId = null;
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.remove();
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    this.needsStaticRedraw = true;
    if (next !== 'playing') {
      this.clearAllInputs();
    } else {
      this.canvas.focus({ preventScroll: true });
    }
  }

  public startNewRun(sectId: SectId, fromUserGesture = true): void {
    if (fromUserGesture) {
      this.sound.unlock();
    }
    this.resetWorldState(sectId);
    this.phase = 'playing';
    this.needsStaticRedraw = true;
    this.clearAllInputs();
    this.canvas.focus({ preventScroll: true });
    this.emitHud();
  }

  public focusCanvas(): void {
    this.canvas.focus({ preventScroll: true });
  }

  public clearAllInputs(): void {
    this.keysHeld.clear();
    this.pointerActive = false;
    this.dashBufferTimer = 0;
  }

  public selectUpgrade(option: UpgradeOption): void {
    if (this.phase !== 'levelup') return;
    this.sound.unlock();

    if (option.kind === 'consumable') {
      if (option.uid === 'consumable_heal') {
        this.heroHp = Math.min(this.heroMaxHp, this.heroHp + 45);
        this.triggerQiShockwave(this.heroX, this.heroY, 210, 42);
      } else if (option.uid === 'consumable_might') {
        this.heroHp = Math.min(this.heroMaxHp, this.heroHp + 25);
        this.magnetizeAllPickups();
      } else {
        this.heroHp = Math.min(this.heroMaxHp, this.heroHp + 30);
        this.dashCooldownTimer = 0;
      }
      this.sound.playLevelUp(false);
    } else {
      const prevMaxHp = this.stats.maxHp;
      const updated = applyUpgradeChoice(this.weapons, this.passives, option);
      this.weapons = updated.weapons;
      this.passives = updated.passives;
      this.recomputeStats();
      const hpDelta = this.stats.maxHp - prevMaxHp;
      if (hpDelta > 0) this.heroHp += hpDelta;

      if (option.kind === 'weapon_evolve') {
        this.sound.playLevelUp(true);
        this.showBanner(`绝世超武觉醒 · 【${option.title}】`, 'gold', 3.4);
        this.spawnBurst(this.heroX, this.heroY, 32, '#d99b26', 260, 'slash');
        this.triggerQiShockwave(this.heroX, this.heroY, 220, 45);
        this.trauma = Math.min(1, this.trauma + 0.55);
      } else {
        this.sound.playLevelUp(false);
        this.spawnBurst(this.heroX, this.heroY, 16, option.accentColor, 180, 'dot');
      }
    }

    this.pendingUpgradeChoices = [];
    this.phase = 'playing';
    this.clearAllInputs();
    this.canvas.focus({ preventScroll: true });
    this.emitHud();
  }

  public rerollUpgrades(): void {
    if (this.phase !== 'levelup' || this.rerollsLeft <= 0) return;
    this.rerollsLeft -= 1;
    this.pendingUpgradeChoices = rollUpgradeChoices(this.weapons, this.passives, Math.random, 3);
    this.sound.playWeaponCast('fan');
    this.callbacks.onLevelUpChoices(this.pendingUpgradeChoices, this.rerollsLeft);
    this.emitHud();
  }

  public getCurrentHudSnapshot(): HudSnapshot {
    return this.buildHudSnapshot();
  }

  private resetWorldState(sectId: SectId): void {
    this.sectId = sectId;
    const sect = SECTS[sectId];
    this.heroX = 0;
    this.heroY = 0;
    this.camX = 0;
    this.camY = 0;
    this.heroFacing = 1;
    this.heroAimAngle = 0;
    this.heroWalkPhase = 0;
    this.heroScaleX = 1;
    this.heroScaleY = 1;
    this.heroInvuln = 0.6;
    this.heroHitFlash = 0;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.dashBufferTimer = 0;
    this.scarfNodes = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: -20, y: 0 },
      { x: -30, y: 0 },
    ];

    this.elapsedSec = 0;
    this.xp = 0;
    this.level = 1;
    this.xpNext = xpRequiredForLevel(1);
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.perfectDodges = 0;
    this.rerollsLeft = 2;

    this.weapons = [{ id: sect.startWeapon, level: 1, evolved: false, totalDamage: 0 }];
    this.passives = [];
    this.weaponCooldowns.clear();
    this.weaponCooldowns.set(sect.startWeapon, 0.25);
    this.taijiAngle = 0;
    this.taijiHitCooldowns.clear();
    this.recomputeStats();
    this.heroHp = this.stats.maxHp;
    this.heroMaxHp = this.stats.maxHp;

    this.spawnTimer = 0.65;
    this.propSpawnTimer = 3.5;
    this.spawnedEliteFlags = ELITE_SPAWN_TIMES.map(() => false);
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.activeAttackTokens = 0;
    this.hitstopTimer = 0;
    this.trauma = 0;
    this.defeatBeatTimer = 0;
    this.pendingDefeat = false;
    this.lastWaveAnnounced = 1;
    this.showBanner('初入竹林 · 拔剑试锋', 'jade', 2.4);

    this.enemies = [];
    this.playerProjectiles = [];
    this.enemyProjectiles = [];
    this.groundZones = [];
    this.lightnings = [];
    this.pickups = [];
    this.breakables = [];

    for (const p of this.particles) p.active = false;
    for (const t of this.floatingTexts) t.active = false;
    for (const a of this.afterimages) a.active = false;

    // Seed initial approachable bandits & 2 courtyard wine jars
    for (let i = 0; i < 5; i++) {
      const ang = (Math.PI * 2 * i) / 5 + 0.35;
      this.spawnEnemyAt('bandit', Math.cos(ang) * 340, Math.sin(ang) * 340, 0.85, 0.92);
    }
    this.spawnBreakableProp(230, -130, 'jar');
    this.spawnBreakableProp(-240, 155, 'jar');
  }

  private recomputeStats(): void {
    this.stats = computeHeroStats(this.sectId, this.passives, this.combo);
    this.heroMaxHp = this.stats.maxHp;
    if (this.heroHp > this.heroMaxHp) this.heroHp = this.heroMaxHp;
  }

  private handleResize(): void {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(320, Math.floor(rect.width));
    this.height = Math.max(240, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.needsStaticRedraw = true;
  }

  private screenToWorld(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: this.camX + (sx - rect.width * 0.5),
      y: this.camY + (sy - rect.height * 0.5),
    };
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.phase !== 'playing') return;
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
    ) {
      e.preventDefault();
    }
    const wasHeld = this.keysHeld.has(e.code);
    this.keysHeld.add(e.code);

    // Edge-triggered Qinggong Dash with 0.12s input buffering
    if (!wasHeld && (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
      this.dashBufferTimer = 0.12;
      this.sound.unlock();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.code);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.phase !== 'playing') return;
    this.sound.unlock();
    this.pointerActive = true;
    this.pointerScreenX = e.clientX;
    this.pointerScreenY = e.clientY;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.pointerActive) return;
    this.pointerScreenX = e.clientX;
    this.pointerScreenY = e.clientY;
  }

  private loop = (nowMs: number): void => {
    this.rafId = null;
    const frameStart = performance.now();
    const rawDt = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);

    if (this.phase === 'playing') {
      this.updateAmbientLeaves(dt);
      this.updateCameraShake(dt);
      if (this.pendingDefeat) {
        this.defeatBeatTimer -= dt;
        this.updateParticles(dt);
        this.updateFloatingTexts(dt);
        if (this.defeatBeatTimer <= 0) {
          this.pendingDefeat = false;
          this.finishRun(false);
        }
      } else if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
        this.updateHitFlashesOnly(dt);
        this.updateParticles(dt * 0.45);
      } else {
        this.stepSimulation(dt);
      }
      this.render();
    } else if (this.phase !== 'title' && this.needsStaticRedraw) {
      this.needsStaticRedraw = false;
      this.render();
    }

    const frameCost = performance.now() - frameStart;
    if (frameCost > 12) {
      this.yieldTimerId = window.setTimeout(() => {
        this.yieldTimerId = null;
        this.rafId = requestAnimationFrame(this.loop);
      }, 4);
    } else {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private updateCameraShake(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const shake = this.trauma * this.trauma * 14;
    this.shakeX = (Math.random() * 2 - 1) * shake;
    this.shakeY = (Math.random() * 2 - 1) * shake;
  }

  private updateHitFlashesOnly(dt: number): void {
    this.heroHitFlash = Math.max(0, this.heroHitFlash - dt);
    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    }
  }

  private updateAmbientLeaves(dt: number): void {
    for (const leaf of this.ambientLeaves) {
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.angle += leaf.spin * dt;
      const dx = leaf.x - this.camX;
      const dy = leaf.y - this.camY;
      if (dx < -this.width * 0.65) leaf.x = this.camX + this.width * 0.65;
      if (dx > this.width * 0.65) leaf.x = this.camX - this.width * 0.65;
      if (dy > this.height * 0.65) leaf.y = this.camY - this.height * 0.65;
      if (dy < -this.height * 0.65) leaf.y = this.camY + this.height * 0.65;
    }
  }

  private stepSimulation(dt: number): void {
    this.elapsedSec += dt;

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.recomputeStats();
      }
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerText = null;
      }
    }

    // Hero movement & Qinggong Dash
    this.updateHero(dt);

    // Smooth camera follow
    const camLerp = 1 - Math.exp(-8.5 * dt);
    this.camX += (this.heroX - this.camX) * camLerp;
    this.camY += (this.heroY - this.camY) * camLerp;

    // Wave Director & Boss/Elite checkpoints
    this.updateWaveDirector(dt);

    // Auto-weapons
    this.updateWeapons(dt);

    // Entities
    this.updatePlayerProjectiles(dt);
    this.updateEnemies(dt);
    this.updateEnemyProjectiles(dt);
    this.updateGroundZones(dt);
    this.updateLightnings(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
    this.updateAfterimages(dt);

    // Throttled HUD sync (~10Hz)
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.1) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private updateHero(dt: number): void {
    if (this.heroInvuln > 0) this.heroInvuln = Math.max(0, this.heroInvuln - dt);
    if (this.heroHitFlash > 0) this.heroHitFlash = Math.max(0, this.heroHitFlash - dt);
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    }
    if (this.dashBufferTimer > 0) {
      this.dashBufferTimer = Math.max(0, this.dashBufferTimer - dt);
    }

    // Elastic damping back to 1,1
    const damp = 1 - Math.exp(-14 * dt);
    this.heroScaleX += (1 - this.heroScaleX) * damp;
    this.heroScaleY += (1 - this.heroScaleY) * damp;

    // Input direction
    let ix = 0;
    let iy = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iy -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iy += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;

    if (ix === 0 && iy === 0 && this.pointerActive) {
      const worldPt = this.screenToWorld(this.pointerScreenX, this.pointerScreenY);
      const dx = worldPt.x - this.heroX;
      const dy = worldPt.y - this.heroY;
      const dist = Math.hypot(dx, dy);
      if (dist > 18) {
        ix = dx / dist;
        iy = dy / dist;
      }
    }

    const mag = Math.hypot(ix, iy);
    if (mag > 0.001) {
      ix /= mag;
      iy /= mag;
      this.heroAimAngle = Math.atan2(iy, ix);
      if (Math.abs(ix) > 0.1) this.heroFacing = ix > 0 ? 1 : -1;
    }

    // Buffered Qinggong Dash activation
    if (this.dashBufferTimer > 0 && this.dashCooldownTimer <= 0 && this.dashTimer <= 0) {
      this.dashBufferTimer = 0;
      this.dashTimer = 0.21;
      this.dashCooldownTimer = this.stats.dashCooldown;
      this.heroInvuln = Math.max(this.heroInvuln, 0.26);
      this.perfectDodgeTriggeredThisDash = false;
      if (mag > 0.01) {
        this.dashDirX = ix;
        this.dashDirY = iy;
      } else {
        this.dashDirX = Math.cos(this.heroAimAngle);
        this.dashDirY = Math.sin(this.heroAimAngle);
      }
      this.heroScaleX = 1.28;
      this.heroScaleY = 0.78;
      this.sound.playDash(false);
      this.spawnBurst(this.heroX, this.heroY + 10, 10, '#f3ebd8', 130, 'dot');
    }

    let moveDx = 0;
    let moveDy = 0;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const dashSpeed = this.stats.moveSpeed * 2.85;
      moveDx = this.dashDirX * dashSpeed * dt;
      moveDy = this.dashDirY * dashSpeed * dt;
      // Spawn ink afterimages
      if (Math.random() < 0.72) {
        this.spawnAfterimage(this.heroX, this.heroY, this.heroFacing, SECTS[this.sectId].scarfColor);
      }
      if (this.dashTimer <= 0) {
        this.heroScaleX = 0.86;
        this.heroScaleY = 1.16;
      }
    } else if (mag > 0.001) {
      moveDx = ix * this.stats.moveSpeed * dt;
      moveDy = iy * this.stats.moveSpeed * dt;
    }

    this.heroX += moveDx;
    this.heroY += moveDy;
    const distMoved = Math.hypot(moveDx, moveDy);
    if (distMoved > 0.1) {
      this.heroWalkPhase += distMoved * 0.13;
    }

    // Update fluttering cinnabar scarf physics trail
    if (this.scarfNodes.length > 0) {
      this.scarfNodes[0].x = this.heroX - this.heroFacing * 5;
      this.scarfNodes[0].y = this.heroY - 8;
      for (let i = 1; i < this.scarfNodes.length; i++) {
        const prev = this.scarfNodes[i - 1];
        const curr = this.scarfNodes[i];
        // Slight ambient breeze
        curr.x -= 28 * dt * this.heroFacing;
        curr.y += Math.sin(this.elapsedSec * 7 + i * 1.1) * 18 * dt;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const d = Math.hypot(dx, dy) || 1;
        const segLen = 9;
        if (d > segLen) {
          curr.x = prev.x + (dx / d) * segLen;
          curr.y = prev.y + (dy / d) * segLen;
        }
      }
    }
  }

  private updateWaveDirector(dt: number): void {
    const cfg = getWaveDirectorConfig(this.elapsedSec);
    if (cfg.waveIndex > this.lastWaveAnnounced) {
      this.lastWaveAnnounced = cfg.waveIndex;
      this.showBanner(`第 ${cfg.waveIndex} 波 · ${cfg.waveTitle}`, 'gold', 2.6);
    }

    // Check Elite Mini-Boss spawns
    for (let i = 0; i < ELITE_SPAWN_TIMES.length; i++) {
      if (!this.spawnedEliteFlags[i] && this.elapsedSec >= ELITE_SPAWN_TIMES[i]) {
        this.spawnedEliteFlags[i] = true;
        const ang = Math.random() * Math.PI * 2;
        const ex = this.heroX + Math.cos(ang) * 480;
        const ey = this.heroY + Math.sin(ang) * 480;
        this.spawnEnemyAt('elite_guard', ex, ey, cfg.hpMult * 1.15, cfg.speedMult);
        this.sound.playBossArrival();
        this.showBanner('强敌来袭 · 锦衣千户现身！', 'crimson', 3.2);
        this.trauma = Math.min(1, this.trauma + 0.4);
      }
    }

    // Check Stage Final Boss spawn
    if (!this.bossSpawned && this.elapsedSec >= BOSS_SPAWN_SEC) {
      this.bossSpawned = true;
      const ang = -Math.PI * 0.25;
      const bx = this.heroX + Math.cos(ang) * 460;
      const by = this.heroY + Math.sin(ang) * 460;
      this.spawnEnemyAt('boss_bloodlord', bx, by, 1, 1);
      this.sound.playBossArrival();
      this.showBanner('关底首领 · 【血煞教主】降临！', 'crimson', 4.0);
      this.trauma = Math.min(1, this.trauma + 0.65);
    }

    // Regular enemy spawning
    const aliveCount = this.enemies.reduce((acc, e) => acc + (e.dying ? 0 : 1), 0);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && aliveCount < cfg.maxEnemies) {
      this.spawnTimer = cfg.spawnInterval;
      const batch = this.elapsedSec > 55 ? 2 : 1;
      for (let b = 0; b < batch; b++) {
        const arch = this.pickWeightedArchetype(cfg.weights);
        const angle = Math.random() * Math.PI * 2;
        const spawnDist = Math.max(this.width, this.height) * 0.56 + 70 + Math.random() * 80;
        this.spawnEnemyAt(
          arch,
          this.heroX + Math.cos(angle) * spawnDist,
          this.heroY + Math.sin(angle) * spawnDist,
          cfg.hpMult,
          cfg.speedMult
        );
      }
    }

    // Breakable Jianghu props spawning
    this.propSpawnTimer -= dt;
    if (this.propSpawnTimer <= 0 && this.breakables.length < 6) {
      this.propSpawnTimer = 8.5;
      const ang = Math.random() * Math.PI * 2;
      const dist = 360 + Math.random() * 220;
      this.spawnBreakableProp(
        this.heroX + Math.cos(ang) * dist,
        this.heroY + Math.sin(ang) * dist,
        Math.random() < 0.25 ? 'chest' : 'jar'
      );
    }

    // Stage victory if final boss is defeated OR player survives well past stage duration after boss spawns
    if (this.bossDefeated) {
      this.finishRun(true);
    } else if (this.elapsedSec >= STAGE_DURATION_SEC + 45 && !this.hasActiveFinalBoss()) {
      this.finishRun(true);
    }
  }

  private hasActiveFinalBoss(): boolean {
    return this.enemies.some((e) => !e.dying && e.archetype === 'boss_bloodlord');
  }

  private pickWeightedArchetype(
    weights: Record<'bandit' | 'crossbow' | 'charger' | 'venom', number>
  ): 'bandit' | 'crossbow' | 'charger' | 'venom' {
    const total = weights.bandit + weights.crossbow + weights.charger + weights.venom;
    let r = Math.random() * total;
    if ((r -= weights.bandit) <= 0) return 'bandit';
    if ((r -= weights.crossbow) <= 0) return 'crossbow';
    if ((r -= weights.charger) <= 0) return 'charger';
    return 'venom';
  }

  private spawnEnemyAt(
    archetype: EnemyArchetype,
    x: number,
    y: number,
    hpMult: number,
    speedMult: number
  ): void {
    let radius = 15;
    let baseHp = 34;
    let speed = 88;
    let contactDamage = 10;
    let xpValue = 4;
    let isBoss = false;
    let isElite = false;
    let displayName: string | undefined;
    let displayTitle: string | undefined;

    if (archetype === 'crossbow') {
      radius = 14;
      baseHp = 28;
      speed = 92;
      contactDamage = 8;
      xpValue = 6;
    } else if (archetype === 'charger') {
      radius = 19;
      baseHp = 78;
      speed = 76;
      contactDamage = 18;
      xpValue = 9;
    } else if (archetype === 'venom') {
      radius = 15;
      baseHp = 44;
      speed = 96;
      contactDamage = 10;
      xpValue = 8;
    } else if (archetype === 'elite_guard') {
      radius = 25;
      baseHp = 420;
      speed = 98;
      contactDamage = 20;
      xpValue = 40;
      isElite = true;
      displayName = '锦衣千户';
      displayTitle = '朝廷鹰犬 · 精英首领';
    } else if (archetype === 'boss_bloodlord') {
      radius = 34;
      baseHp = 1950;
      speed = 104;
      contactDamage = 26;
      xpValue = 120;
      isBoss = true;
      displayName = '血煞教主';
      displayTitle = '魔教至尊 · 关底首领';
    }

    const maxHp = Math.round(baseHp * hpMult);
    this.enemies.push({
      id: this.nextEntityId++,
      archetype,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      hp: maxHp,
      maxHp,
      speed: speed * speedMult,
      contactDamage,
      xpValue,
      hitFlash: 0,
      slowTimer: 0,
      walkPhase: Math.random() * 10,
      facing: x > this.heroX ? -1 : 1,
      aiState: 'move',
      aiTimer: 1.0 + Math.random() * 1.1,
      aimAngle: 0,
      orbitDir: Math.random() > 0.5 ? 1 : -1,
      hasToken: false,
      dying: false,
      koTimer: 0,
      koVx: 0,
      koVy: 0,
      bossPattern: 0,
      isBoss,
      isElite,
      displayName,
      displayTitle,
    });
  }

  private spawnBreakableProp(x: number, y: number, kind: 'jar' | 'chest'): void {
    this.breakables.push({
      id: this.nextEntityId++,
      kind,
      x,
      y,
      hp: kind === 'chest' ? 45 : 20,
      maxHp: kind === 'chest' ? 45 : 20,
      hitFlash: 0,
    });
  }

  private updateWeapons(dt: number): void {
    // Decrement Taiji per-enemy contact cooldowns
    for (const [eid, t] of this.taijiHitCooldowns.entries()) {
      const next = t - dt;
      if (next <= 0) this.taijiHitCooldowns.delete(eid);
      else this.taijiHitCooldowns.set(eid, next);
    }

    for (const w of this.weapons) {
      const def = WEAPONS[w.id];
      if (w.id === 'taiji_chakram') {
        this.updateTaijiChakram(w, dt);
        continue;
      }

      const prevCd = this.weaponCooldowns.get(w.id) ?? 0;
      const nextCd = prevCd - dt;
      if (nextCd > 0) {
        this.weaponCooldowns.set(w.id, nextCd);
        continue;
      }

      const lvlFactor = 1 - (w.level - 1) * 0.06;
      const evoFactor = w.evolved ? 0.72 : 1;
      const cooldown = Math.max(0.22, def.baseCooldown * lvlFactor * evoFactor * this.stats.cooldownMult);
      this.weaponCooldowns.set(w.id, cooldown);

      if (w.id === 'flying_sword') this.fireFlyingSword(w);
      else if (w.id === 'storm_fan') this.fireStormFan(w);
      else if (w.id === 'thunder_talisman') this.fireThunderTalisman(w);
      else if (w.id === 'flame_gourd') this.fireFlameGourd(w);
      else if (w.id === 'frost_shuriken') this.fireFrostShuriken(w);
    }
  }

  private findNearestEnemies(count: number, maxRange: number): EnemyEntity[] {
    const candidates = this.enemies.filter((e) => !e.dying);
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - this.heroX, a.y - this.heroY) -
        Math.hypot(b.x - this.heroX, b.y - this.heroY)
    );
    return candidates
      .filter((e) => Math.hypot(e.x - this.heroX, e.y - this.heroY) <= maxRange)
      .slice(0, count);
  }

  private fireFlyingSword(w: OwnedWeapon): void {
    const def = WEAPONS.flying_sword;
    const count = w.evolved ? 5 : 1 + Math.floor(w.level / 2);
    const targets = this.findNearestEnemies(count, 580);
    const baseDmg = def.baseDamage * (1 + (w.level - 1) * 0.28) * (w.evolved ? 1.55 : 1);
    const speed = (w.evolved ? 640 : 500 + w.level * 22) * this.stats.projSpeedMult;
    const pierce = w.evolved ? 8 : 1 + (w.level >= 3 ? 1 : 0) + (w.level >= 5 ? 1 : 0);

    for (let i = 0; i < count; i++) {
      let angle = this.heroAimAngle + (i - (count - 1) / 2) * 0.18;
      if (targets.length > 0) {
        const tgt = targets[i % targets.length];
        angle = Math.atan2(tgt.y - this.heroY, tgt.x - this.heroX);
        if (count > targets.length) {
          angle += (i - (count - 1) / 2) * 0.14;
        }
      }
      this.playerProjectiles.push({
        id: this.nextEntityId++,
        weaponId: 'flying_sword',
        evolved: w.evolved,
        x: this.heroX,
        y: this.heroY,
        prevX: this.heroX,
        prevY: this.heroY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: (w.evolved ? 16 : 11) * this.stats.areaMult,
        damage: baseDmg,
        pierce,
        life: 1.35,
        maxLife: 1.35,
        rotation: angle,
        spinSpeed: 0,
        hitIds: new Set(),
      });
    }
    this.sound.playWeaponCast('sword');
  }

  private fireStormFan(w: OwnedWeapon): void {
    const def = WEAPONS.storm_fan;
    const count = w.evolved ? 4 : 1 + Math.floor(w.level / 2);
    const targets = this.findNearestEnemies(1, 520);
    const baseAngle =
      targets.length > 0
        ? Math.atan2(targets[0].y - this.heroY, targets[0].x - this.heroX)
        : this.heroAimAngle;
    const baseDmg = def.baseDamage * (1 + (w.level - 1) * 0.25) * (w.evolved ? 1.55 : 1);
    const speed = (w.evolved ? 430 : 370) * this.stats.projSpeedMult;

    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.42;
      const ang = baseAngle + spread;
      this.playerProjectiles.push({
        id: this.nextEntityId++,
        weaponId: 'storm_fan',
        evolved: w.evolved,
        x: this.heroX,
        y: this.heroY,
        prevX: this.heroX,
        prevY: this.heroY,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: (w.evolved ? 28 : 16 + w.level * 1.4) * this.stats.areaMult,
        damage: baseDmg,
        pierce: 99,
        life: w.evolved ? 2.2 : 1.75,
        maxLife: w.evolved ? 2.2 : 1.75,
        rotation: ang,
        spinSpeed: w.evolved ? 16 : 12,
        boomerang: true,
        returning: false,
        hitIds: new Set(),
      });
    }
    this.sound.playWeaponCast('fan');
  }

  private updateTaijiChakram(w: OwnedWeapon, dt: number): void {
    const def = WEAPONS.taiji_chakram;
    const rotSpeed = w.evolved ? 4.4 : 2.6 + w.level * 0.3;
    this.taijiAngle += rotSpeed * dt;

    const count = w.evolved ? 6 : Math.min(5, 1 + w.level);
    const orbitRadius = (w.evolved ? 102 : 72 + w.level * 6) * this.stats.areaMult;
    const orbSize = (w.evolved ? 19 : 13 + w.level * 0.8) * this.stats.areaMult;
    const baseDmg = def.baseDamage * (1 + (w.level - 1) * 0.24) * (w.evolved ? 1.6 : 1);

    for (let i = 0; i < count; i++) {
      const ang = this.taijiAngle + (Math.PI * 2 * i) / count;
      const ox = this.heroX + Math.cos(ang) * orbitRadius;
      const oy = this.heroY + Math.sin(ang) * orbitRadius;

      // Hit enemies
      for (const e of this.enemies) {
        if (e.dying) continue;
        if (this.taijiHitCooldowns.has(e.id)) continue;
        const d = Math.hypot(e.x - ox, e.y - oy);
        if (d < e.radius + orbSize) {
          this.taijiHitCooldowns.set(e.id, w.evolved ? 0.22 : 0.34);
          this.damageEnemy(e, baseDmg, 'taiji_chakram', ox, oy, w.evolved ? 180 : 120);
        }
      }

      // Hit breakables
      for (const prop of this.breakables) {
        if (Math.hypot(prop.x - ox, prop.y - oy) < 22 + orbSize) {
          this.damageBreakable(prop, baseDmg);
        }
      }

      // Evolved Bagua Array deflects enemy projectiles!
      if (w.evolved) {
        for (let pi = this.enemyProjectiles.length - 1; pi >= 0; pi--) {
          const ep = this.enemyProjectiles[pi];
          if (Math.hypot(ep.x - ox, ep.y - oy) < orbSize + ep.radius + 6) {
            this.spawnBurst(ep.x, ep.y, 6, '#1e8c6e', 110, 'dot');
            this.enemyProjectiles.splice(pi, 1);
          }
        }
      }
    }
  }

  private fireThunderTalisman(w: OwnedWeapon): void {
    const def = WEAPONS.thunder_talisman;
    const strikes = w.evolved ? 5 : 1 + Math.floor((w.level + 1) / 2);
    const targets = this.findNearestEnemies(strikes * 2, 520);
    if (targets.length === 0) return;

    const baseDmg = def.baseDamage * (1 + (w.level - 1) * 0.28) * (w.evolved ? 1.65 : 1);
    const blastRadius = (w.evolved ? 82 : 54 + w.level * 5) * this.stats.areaMult;

    for (let i = 0; i < Math.min(strikes, targets.length); i++) {
      const tgt = targets[i];
      this.lightnings.push({
        x: tgt.x,
        y: tgt.y,
        radius: blastRadius,
        timer: 0.28,
        maxTimer: 0.28,
        evolved: w.evolved,
        chainFromX: w.evolved && i > 0 ? targets[i - 1].x : undefined,
        chainFromY: w.evolved && i > 0 ? targets[i - 1].y : undefined,
      });

      this.spawnBurst(tgt.x, tgt.y, w.evolved ? 16 : 10, w.evolved ? '#facc15' : '#eab308', 190, 'slash');
      for (const e of this.enemies) {
        if (e.dying) continue;
        if (Math.hypot(e.x - tgt.x, e.y - tgt.y) <= blastRadius + e.radius) {
          this.damageEnemy(e, baseDmg, 'thunder_talisman', tgt.x, tgt.y, 70);
          if (w.level >= 4 || w.evolved) {
            e.slowTimer = Math.max(e.slowTimer, 0.9);
          }
        }
      }
      for (const prop of this.breakables) {
        if (Math.hypot(prop.x - tgt.x, prop.y - tgt.y) <= blastRadius + 20) {
          this.damageBreakable(prop, baseDmg);
        }
      }
    }
    this.sound.playWeaponCast('thunder');
    if (w.evolved) this.trauma = Math.min(1, this.trauma + 0.16);
  }

  private fireFlameGourd(w: OwnedWeapon): void {
    const def = WEAPONS.flame_gourd;
    const count = w.evolved ? 3 : 1 + Math.floor(w.level / 2);
    const targets = this.findNearestEnemies(count, 440);
    const baseDmg = def.baseDamage * (1 + (w.level - 1) * 0.28) * (w.evolved ? 1.75 : 1);
    const zoneRadius = (w.evolved ? 94 : 56 + w.level * 6) * this.stats.areaMult;
    const duration = w.evolved ? 4.4 : 2.9 + w.level * 0.3;

    for (let i = 0; i < count; i++) {
      let tx: number;
      let ty: number;
      if (targets[i]) {
        tx = targets[i].x + (Math.random() - 0.5) * 28;
        ty = targets[i].y + (Math.random() - 0.5) * 28;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 140;
        tx = this.heroX + Math.cos(ang) * dist;
        ty = this.heroY + Math.sin(ang) * dist;
      }

      this.groundZones.push({
        kind: 'player_fire',
        weaponId: 'flame_gourd',
        evolved: w.evolved,
        x: tx,
        y: ty,
        radius: zoneRadius,
        damage: baseDmg,
        windup: 0,
        maxWindup: 0,
        life: duration,
        maxLife: duration,
        tickTimer: 0.05,
        triggered: true,
        dodged: false,
      });
      this.spawnBurst(tx, ty, 12, w.evolved ? '#dc2626' : '#ea580c', 150, 'dot');
    }
    this.sound.playWeaponCast('fire');
  }

  private fireFrostShuriken(w: OwnedWeapon): void {
    const def = WEAPONS.frost_shuriken;
    const count = w.evolved ? 7 : 1 + w.level;
    const targets = this.findNearestEnemies(1, 460);
    const centerAngle =
      targets.length > 0
        ? Math.atan2(targets[0].y - this.heroY, targets[0].x - this.heroX)
        : this.heroAimAngle;
    const baseDmg = def.baseDamage * (1 + (w.level - 1) * 0.24) * (w.evolved ? 1.55 : 1);
    const speed = (w.evolved ? 590 : 470) * this.stats.projSpeedMult;
    const pierce = w.evolved ? 5 : 1 + (w.level >= 3 ? 1 : 0);

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * (w.evolved ? 0.14 : 0.18);
      const ang = centerAngle + spread;
      this.playerProjectiles.push({
        id: this.nextEntityId++,
        weaponId: 'frost_shuriken',
        evolved: w.evolved,
        x: this.heroX,
        y: this.heroY,
        prevX: this.heroX,
        prevY: this.heroY,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: (w.evolved ? 12 : 9) * this.stats.areaMult,
        damage: baseDmg,
        pierce,
        life: 1.15,
        maxLife: 1.15,
        rotation: ang,
        spinSpeed: 18,
        slowAmount: w.evolved ? 2.4 : 1.5,
        hitIds: new Set(),
      });
    }
    this.sound.playWeaponCast('ice');
  }

  private updatePlayerProjectiles(dt: number): void {
    for (let i = this.playerProjectiles.length - 1; i >= 0; i--) {
      const p = this.playerProjectiles[i];
      p.prevX = p.x;
      p.prevY = p.y;
      p.life -= dt;
      if (p.life <= 0) {
        this.playerProjectiles.splice(i, 1);
        continue;
      }

      if (p.boomerang) {
        const elapsedFrac = 1 - p.life / p.maxLife;
        if (elapsedFrac > 0.42 && !p.returning) {
          p.returning = true;
          p.hitIds.clear(); // Can slice enemies again on return!
        }
        if (p.returning) {
          const dx = this.heroX - p.x;
          const dy = this.heroY - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const returnSpeed = (p.evolved ? 560 : 460) * this.stats.projSpeedMult;
          p.vx += ((dx / dist) * returnSpeed - p.vx) * Math.min(1, dt * 8);
          p.vy += ((dy / dist) * returnSpeed - p.vy) * Math.min(1, dt * 8);
          if (dist < 26) {
            this.playerProjectiles.splice(i, 1);
            continue;
          }
        } else {
          p.vx *= 1 - dt * 1.1;
          p.vy *= 1 - dt * 1.1;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spinSpeed !== 0) p.rotation += p.spinSpeed * dt;

      // Evolved storm fan gentle pull on nearby enemies
      if (p.weaponId === 'storm_fan' && p.evolved) {
        for (const e of this.enemies) {
          if (e.dying || e.isBoss) continue;
          const dx = p.x - e.x;
          const dy = p.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d > 12 && d < 120) {
            e.x += (dx / d) * 95 * dt;
            e.y += (dy / d) * 95 * dt;
          }
        }
      }

      // Collide with enemies
      let consumed = false;
      for (const e of this.enemies) {
        if (e.dying || p.hitIds.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + p.radius) {
          p.hitIds.add(e.id);
          const kb = p.weaponId === 'storm_fan' ? 140 : 85;
          this.damageEnemy(e, p.damage, p.weaponId, p.x, p.y, kb);
          if (p.slowAmount) {
            e.slowTimer = Math.max(e.slowTimer, p.slowAmount);
          }
          p.pierce -= 1;
          if (p.pierce <= 0) {
            consumed = true;
            break;
          }
        }
      }

      // Collide with breakable props
      for (const prop of this.breakables) {
        if (Math.hypot(prop.x - p.x, prop.y - p.y) <= 22 + p.radius) {
          this.damageBreakable(prop, p.damage);
        }
      }

      if (consumed) {
        this.playerProjectiles.splice(i, 1);
      }
    }
  }

  private damageBreakable(prop: BreakableProp, rawDmg: number): void {
    prop.hp -= rawDmg;
    prop.hitFlash = 0.08;
    if (prop.hp <= 0) {
      const idx = this.breakables.indexOf(prop);
      if (idx !== -1) this.breakables.splice(idx, 1);
      this.spawnBurst(prop.x, prop.y, 14, prop.kind === 'chest' ? '#d99b26' : '#8b5a2b', 160, 'dot');
      this.sound.playHit(false, true);

      if (prop.kind === 'chest') {
        this.pickups.push({
          kind: 'scroll',
          x: prop.x,
          y: prop.y,
          value: Math.max(18, Math.round(this.xpNext * 0.45)),
          magnetized: false,
          bobPhase: 0,
        });
        this.pickups.push({
          kind: 'bun_heal',
          x: prop.x + 18,
          y: prop.y - 10,
          value: 28,
          magnetized: false,
          bobPhase: 1,
        });
      } else {
        const r = Math.random();
        if (r < 0.48) {
          this.pickups.push({ kind: 'bun_heal', x: prop.x, y: prop.y, value: 30, magnetized: false, bobPhase: 0 });
        } else if (r < 0.82) {
          this.pickups.push({ kind: 'magnet', x: prop.x, y: prop.y, value: 1, magnetized: false, bobPhase: 0 });
        } else {
          this.pickups.push({ kind: 'xp_gold', x: prop.x, y: prop.y, value: 16, magnetized: false, bobPhase: 0 });
        }
      }
    }
  }

  private damageEnemy(
    e: EnemyEntity,
    baseDmg: number,
    weaponId: WeaponId,
    sourceX: number,
    sourceY: number,
    knockbackStrength: number
  ): void {
    const { amount, isCrit } = computeHitDamage(baseDmg, this.stats, Math.random());
    e.hp -= amount;
    e.hitFlash = 0.075;

    // Track weapon DPS breakdown
    const owned = this.weapons.find((w) => w.id === weaponId);
    if (owned) owned.totalDamage += amount;

    // Knockback
    const dx = e.x - sourceX;
    const dy = e.y - sourceY;
    const dist = Math.hypot(dx, dy) || 1;
    const resist = e.isBoss ? 0.12 : e.isElite ? 0.35 : 1.0;
    e.x += (dx / dist) * knockbackStrength * 0.14 * resist;
    e.y += (dy / dist) * knockbackStrength * 0.14 * resist;

    // Floating damage number
    this.spawnFloatingText(
      e.x + (Math.random() - 0.5) * 16,
      e.y - e.radius - 6,
      isCrit ? `${amount}!` : `${amount}`,
      isCrit ? '#d99b26' : '#f8f4ea',
      isCrit ? 19 : 14
    );

    if (e.hp <= 0 && !e.dying) {
      e.dying = true;
      e.koTimer = 0.32;
      e.koVx = (dx / dist) * (e.isBoss ? 90 : 190);
      e.koVy = (dy / dist) * (e.isBoss ? 90 : 190);
      if (e.hasToken) {
        e.hasToken = false;
        this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
      }

      this.kills += 1;
      this.combo += 1;
      this.comboTimer = 3.6;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      if (this.combo % 10 === 0) this.recomputeStats();

      // Drop XP & rewards
      const orbKind =
        e.isBoss || e.isElite ? 'xp_gold' : e.xpValue >= 8 ? 'xp_mid' : 'xp_small';
      this.pickups.push({
        kind: orbKind,
        x: e.x,
        y: e.y,
        value: e.xpValue,
        magnetized: false,
        bobPhase: Math.random() * 6,
      });
      if (e.isElite) {
        this.pickups.push({ kind: 'magnet', x: e.x + 20, y: e.y, value: 1, magnetized: false, bobPhase: 0 });
        this.pickups.push({ kind: 'bun_heal', x: e.x - 20, y: e.y, value: 35, magnetized: false, bobPhase: 1 });
        this.showBanner('斩杀锦衣千户 · 掉落吸星秘宝！', 'gold', 2.8);
      }
      if (e.archetype === 'boss_bloodlord') {
        this.bossDefeated = true;
        this.hitstopTimer = 0.08;
        this.trauma = 0.85;
        this.spawnBurst(e.x, e.y, 44, '#c93b2b', 280, 'slash');
      } else {
        this.spawnBurst(e.x, e.y, isCrit ? 14 : 9, isCrit ? '#d99b26' : '#231f20', 165, 'dot');
        if (e.isElite || isCrit) {
          this.hitstopTimer = Math.max(this.hitstopTimer, e.isElite ? 0.065 : 0.028);
          this.trauma = Math.min(1, this.trauma + (e.isElite ? 0.45 : 0.12));
        }
      }
      this.sound.playHit(isCrit, true);
    } else {
      this.spawnBurst(e.x, e.y, isCrit ? 7 : 3, isCrit ? '#d99b26' : '#f3ebd8', 110, 'slash');
      this.sound.playHit(isCrit, false);
    }
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

      if (e.dying) {
        e.koTimer -= dt;
        e.x += e.koVx * dt;
        e.y += e.koVy * dt;
        e.koVx *= 1 - dt * 5;
        e.koVy *= 1 - dt * 5;
        if (e.koTimer <= 0) {
          this.enemies.splice(i, 1);
        }
        continue;
      }

      const dx = this.heroX - e.x;
      const dy = this.heroY - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const slowMult = e.slowTimer > 0 ? 0.56 : 1.0;

      // Despawn very distant regular mobs so horde stays around player
      if (!e.isBoss && !e.isElite && dist > 1150) {
        if (e.hasToken) {
          e.hasToken = false;
          this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
        }
        this.enemies.splice(i, 1);
        continue;
      }

      // Soft separation steering from neighbors so hordes look crisp and readable
      let sepX = 0;
      let sepY = 0;
      for (let j = Math.max(0, i - 10); j < Math.min(this.enemies.length, i + 10); j++) {
        if (i === j) continue;
        const other = this.enemies[j];
        if (other.dying) continue;
        const sx = e.x - other.x;
        const sy = e.y - other.y;
        const sd = Math.hypot(sx, sy);
        const minSep = e.radius + other.radius + 4;
        if (sd > 0.1 && sd < minSep) {
          const push = (minSep - sd) / minSep;
          sepX += (sx / sd) * push * 85;
          sepY += (sy / sd) * push * 85;
        }
      }

      // Distinct Movement & Attack Policies
      if (e.archetype === 'bandit') {
        e.vx = dirX * e.speed * slowMult + sepX;
        e.vy = dirY * e.speed * slowMult + sepY;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.facing = dirX >= 0 ? 1 : -1;
      } else if (e.archetype === 'crossbow') {
        this.stepCrossbowAi(e, dt, dirX, dirY, dist, slowMult, sepX, sepY);
      } else if (e.archetype === 'charger') {
        this.stepChargerAi(e, dt, dirX, dirY, dist, slowMult, sepX, sepY);
      } else if (e.archetype === 'venom') {
        this.stepVenomAi(e, dt, dirX, dirY, dist, slowMult, sepX, sepY);
      } else {
        this.stepBossOrEliteAi(e, dt, dirX, dirY, dist, slowMult);
      }

      e.walkPhase += Math.hypot(e.vx, e.vy) * dt * 0.11;

      // Contact collision with Hero (or Perfect Dodge detection during Dash!)
      const touchDist = e.radius + 14;
      if (dist < touchDist) {
        if (this.dashTimer > 0) {
          if (e.aiState === 'attack' || e.isBoss || e.isElite) {
            this.tryTriggerPerfectDodge(e.x, e.y);
          }
        } else {
          this.damageHero(e.contactDamage, e.x, e.y);
        }
      }
    }
  }

  private stepCrossbowAi(
    e: EnemyEntity,
    dt: number,
    dirX: number,
    dirY: number,
    dist: number,
    slowMult: number,
    sepX: number,
    sepY: number
  ): void {
    e.facing = dirX >= 0 ? 1 : -1;
    if (e.aiState === 'move') {
      // Kiter maintains 240-310px range
      const desiredMove = dist > 310 ? 1 : dist < 210 ? -0.75 : 0;
      e.vx = dirX * e.speed * slowMult * desiredMove + sepX;
      e.vy = dirY * e.speed * slowMult * desiredMove + sepY;
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      e.aiTimer -= dt;
      if (e.aiTimer <= 0 && dist < 410 && this.activeAttackTokens < MAX_ATTACK_TOKENS) {
        e.aiState = 'windup';
        e.aiTimer = 0.58; // 0.58s crimson sightline telegraph
        e.aimAngle = Math.atan2(this.heroY - e.y, this.heroX - e.x);
        e.hasToken = true;
        this.activeAttackTokens += 1;
        this.sound.playTelegraph();
      }
    } else if (e.aiState === 'windup') {
      e.vx = 0;
      e.vy = 0;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        // Fire poison bolt
        const speed = 320;
        this.enemyProjectiles.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(e.aimAngle) * speed,
          vy: Math.sin(e.aimAngle) * speed,
          radius: 6,
          damage: 14,
          life: 2.2,
          color: '#b91c1c',
          dodged: false,
        });
        if (e.hasToken) {
          e.hasToken = false;
          this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
        }
        e.aiState = 'recover';
        e.aiTimer = 0.9;
      }
    } else {
      e.vx = sepX * 0.4;
      e.vy = sepY * 0.4;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiState = 'move';
        e.aiTimer = 1.6 + Math.random() * 0.8;
      }
    }
  }

  private stepChargerAi(
    e: EnemyEntity,
    dt: number,
    dirX: number,
    dirY: number,
    dist: number,
    slowMult: number,
    sepX: number,
    sepY: number
  ): void {
    if (e.aiState === 'move') {
      e.facing = dirX >= 0 ? 1 : -1;
      e.vx = dirX * e.speed * slowMult + sepX;
      e.vy = dirY * e.speed * slowMult + sepY;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.aiTimer -= dt;

      if (e.aiTimer <= 0 && dist < 310 && this.activeAttackTokens < MAX_ATTACK_TOKENS) {
        e.aiState = 'windup';
        e.aiTimer = 0.65; // 0.65s locked ground charge lane telegraph
        e.aimAngle = Math.atan2(this.heroY - e.y, this.heroX - e.x);
        e.hasToken = true;
        this.activeAttackTokens += 1;
        this.sound.playTelegraph();
      }
    } else if (e.aiState === 'windup') {
      e.vx = 0;
      e.vy = 0;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiState = 'attack';
        e.aiTimer = 0.48;
      }
    } else if (e.aiState === 'attack') {
      const chargeSpeed = 355 * slowMult;
      e.vx = Math.cos(e.aimAngle) * chargeSpeed;
      e.vy = Math.sin(e.aimAngle) * chargeSpeed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (Math.random() < 0.45) {
        this.spawnBurst(e.x, e.y + 12, 1, '#a89f8c', 50, 'dot');
      }
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        if (e.hasToken) {
          e.hasToken = false;
          this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
        }
        e.aiState = 'recover';
        e.aiTimer = 0.95;
      }
    } else {
      e.vx = 0;
      e.vy = 0;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiState = 'move';
        e.aiTimer = 2.0 + Math.random() * 0.9;
      }
    }
  }

  private stepVenomAi(
    e: EnemyEntity,
    dt: number,
    dirX: number,
    dirY: number,
    dist: number,
    slowMult: number,
    sepX: number,
    sepY: number
  ): void {
    e.facing = dirX >= 0 ? 1 : -1;
    // Tangential orbiter around player
    const tangX = -dirY * e.orbitDir;
    const tangY = dirX * e.orbitDir;
    const radialPull = dist > 235 ? 0.7 : dist < 165 ? -0.6 : 0.05;
    e.vx = (tangX * 0.85 + dirX * radialPull) * e.speed * slowMult + sepX;
    e.vy = (tangY * 0.85 + dirY * radialPull) * e.speed * slowMult + sepY;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    e.aiTimer -= dt;
    if (e.aiTimer <= 0 && dist < 350 && this.activeAttackTokens < MAX_ATTACK_TOKENS) {
      // Spawn telegraphed venom ring at hero's current position
      this.groundZones.push({
        kind: 'enemy_venom',
        x: this.heroX + (Math.random() - 0.5) * 40,
        y: this.heroY + (Math.random() - 0.5) * 40,
        radius: 56,
        damage: 13,
        windup: 0.78,
        maxWindup: 0.78,
        life: 2.4,
        maxLife: 2.4,
        tickTimer: 0.1,
        triggered: false,
        dodged: false,
      });
      this.sound.playTelegraph();
      e.aiTimer = 3.2 + Math.random() * 1.1;
    }
  }

  private stepBossOrEliteAi(
    e: EnemyEntity,
    dt: number,
    dirX: number,
    dirY: number,
    dist: number,
    slowMult: number
  ): void {
    e.facing = dirX >= 0 ? 1 : -1;

    if (e.aiState === 'move') {
      e.vx = dirX * e.speed * slowMult;
      e.vy = dirY * e.speed * slowMult;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0 && dist < 440) {
        e.aiState = 'windup';
        e.bossPattern = (e.bossPattern + 1) % (e.isBoss ? 3 : 2);
        e.aimAngle = Math.atan2(this.heroY - e.y, this.heroX - e.x);
        e.aiTimer = 0.72; // Clear telegraph window
        this.sound.playTelegraph();

        if (e.bossPattern === 1) {
          // Ground shockwave slam ring telegraph
          this.groundZones.push({
            kind: 'enemy_slam',
            x: this.heroX,
            y: this.heroY,
            radius: e.isBoss ? 102 : 78,
            damage: e.isBoss ? 26 : 18,
            windup: 0.78,
            maxWindup: 0.78,
            life: 0.28,
            maxLife: 0.28,
            tickTimer: 0,
            triggered: false,
            dodged: false,
          });
        }
      }
    } else if (e.aiState === 'windup') {
      e.vx = 0;
      e.vy = 0;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        if (e.bossPattern === 0) {
          // Radial Crimson Blade Fan
          const count = e.isBoss ? 9 : 5;
          for (let k = 0; k < count; k++) {
            const ang = e.aimAngle + (k - (count - 1) / 2) * 0.24;
            this.enemyProjectiles.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 295,
              vy: Math.sin(ang) * 295,
              radius: 8,
              damage: e.isBoss ? 18 : 14,
              life: 2.6,
              color: '#c93b2b',
              dodged: false,
            });
          }
          e.aiState = 'recover';
          e.aiTimer = 0.85;
        } else if (e.bossPattern === 1) {
          e.aiState = 'recover';
          e.aiTimer = 0.7;
        } else {
          // Shadow Lunge Strike
          e.aiState = 'attack';
          e.aiTimer = 0.46;
        }
      }
    } else if (e.aiState === 'attack') {
      const lungeSpeed = 430;
      e.vx = Math.cos(e.aimAngle) * lungeSpeed;
      e.vy = Math.sin(e.aimAngle) * lungeSpeed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiState = 'recover';
        e.aiTimer = 0.85;
      }
    } else {
      e.vx = 0;
      e.vy = 0;
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiState = 'move';
        e.aiTimer = e.isBoss ? 1.5 : 2.1;
      }
    }
  }

  private updateEnemyProjectiles(dt: number): void {
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = this.enemyProjectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) {
        this.enemyProjectiles.splice(i, 1);
        continue;
      }

      const d = Math.hypot(p.x - this.heroX, p.y - this.heroY);
      if (d < p.radius + 14) {
        if (this.dashTimer > 0) {
          if (!p.dodged) {
            p.dodged = true;
            this.tryTriggerPerfectDodge(p.x, p.y);
          }
        } else {
          this.damageHero(p.damage, p.x, p.y);
          this.enemyProjectiles.splice(i, 1);
        }
      }
    }
  }

  private updateGroundZones(dt: number): void {
    for (let i = this.groundZones.length - 1; i >= 0; i--) {
      const z = this.groundZones[i];
      if (z.windup > 0) {
        z.windup -= dt;
        if (z.windup <= 0) {
          z.triggered = true;
          if (z.kind === 'enemy_slam') {
            this.spawnBurst(z.x, z.y, 22, '#c93b2b', 210, 'ring');
            this.trauma = Math.min(1, this.trauma + 0.25);
          }
        }
        continue;
      }

      z.life -= dt;
      if (z.life <= 0) {
        this.groundZones.splice(i, 1);
        continue;
      }

      if (z.kind === 'player_fire') {
        z.tickTimer -= dt;
        if (z.tickTimer <= 0) {
          z.tickTimer = z.evolved ? 0.26 : 0.38;
          for (const e of this.enemies) {
            if (e.dying) continue;
            if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + e.radius) {
              this.damageEnemy(e, z.damage, z.weaponId ?? 'flame_gourd', z.x, z.y, 18);
            }
          }
        }
      } else {
        // Enemy venom or slam zone
        const dist = Math.hypot(this.heroX - z.x, this.heroY - z.y);
        if (dist <= z.radius + 10) {
          if (this.dashTimer > 0) {
            if (!z.dodged) {
              z.dodged = true;
              this.tryTriggerPerfectDodge(z.x, z.y);
            }
          } else {
            z.tickTimer -= dt;
            if (z.tickTimer <= 0) {
              z.tickTimer = z.kind === 'enemy_slam' ? 9 : 0.55;
              this.damageHero(z.damage, z.x, z.y);
            }
          }
        }
      }
    }
  }

  private tryTriggerPerfectDodge(threatX: number, threatY: number): void {
    if (this.perfectDodgeTriggeredThisDash) return;
    this.perfectDodgeTriggeredThisDash = true;
    this.perfectDodges += 1;
    this.dashCooldownTimer *= 0.4;
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.055);
    this.trauma = Math.min(1, this.trauma + 0.28);
    this.sound.playDash(true);
    this.spawnFloatingText(this.heroX, this.heroY - 34, '身法破招！', '#d99b26', 20);
    this.triggerQiShockwave(this.heroX, this.heroY, 175, 28);
    this.pickups.push({
      kind: 'xp_mid',
      x: (this.heroX + threatX) * 0.5,
      y: (this.heroY + threatY) * 0.5,
      value: 10,
      magnetized: true,
      bobPhase: 0,
    });
  }

  private triggerQiShockwave(x: number, y: number, radius: number, damage: number): void {
    this.spawnBurst(x, y, 22, '#d99b26', 220, 'ring');
    for (const e of this.enemies) {
      if (e.dying) continue;
      if (Math.hypot(e.x - x, e.y - y) <= radius + e.radius) {
        const activeWeapon = this.weapons[0]?.id ?? 'flying_sword';
        this.damageEnemy(e, damage, activeWeapon, x, y, 220);
      }
    }
  }

  private damageHero(amount: number, sourceX: number, sourceY: number): void {
    if (this.heroInvuln > 0 || this.pendingDefeat) return;
    const dmg = Math.max(1, Math.round(amount));
    this.heroHp = Math.max(0, this.heroHp - dmg);
    this.heroInvuln = 0.55;
    this.heroHitFlash = 0.16;
    this.trauma = Math.min(1, this.trauma + 0.42);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.04);
    this.sound.playPlayerHurt();
    this.spawnFloatingText(this.heroX, this.heroY - 26, `-${dmg}`, '#c93b2b', 18);
    this.spawnBurst(this.heroX, this.heroY, 12, '#c93b2b', 150, 'dot');

    // Subtle knockback impulse
    const dx = this.heroX - sourceX;
    const dy = this.heroY - sourceY;
    const d = Math.hypot(dx, dy) || 1;
    this.heroX += (dx / d) * 14;
    this.heroY += (dy / d) * 14;

    this.emitHud();

    if (this.heroHp <= 0) {
      this.pendingDefeat = true;
      this.defeatBeatTimer = 0.55;
      this.trauma = 0.75;
      this.spawnBurst(this.heroX, this.heroY, 28, '#c93b2b', 220, 'slash');
      this.sound.playOutcome(false);
    }
  }

  private updateLightnings(dt: number): void {
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      this.lightnings[i].timer -= dt;
      if (this.lightnings[i].timer <= 0) this.lightnings.splice(i, 1);
    }
  }

  private magnetizeAllPickups(): void {
    for (const p of this.pickups) {
      if (p.kind === 'xp_small' || p.kind === 'xp_mid' || p.kind === 'xp_gold' || p.kind === 'scroll') {
        p.magnetized = true;
      }
    }
    this.showBanner('吸星聚气 · 真气归元！', 'jade', 2.0);
  }

  private updatePickups(dt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.bobPhase += dt * 4;
      const dx = this.heroX - p.x;
      const dy = this.heroY - p.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (!p.magnetized && dist <= this.stats.pickupRadius) {
        p.magnetized = true;
      }

      if (p.magnetized) {
        const pullSpeed = 480;
        p.x += (dx / dist) * pullSpeed * dt;
        p.y += (dy / dist) * pullSpeed * dt;
      }

      if (dist < 22) {
        this.pickups.splice(i, 1);
        if (p.kind === 'bun_heal') {
          this.heroHp = Math.min(this.heroMaxHp, this.heroHp + p.value);
          this.spawnFloatingText(this.heroX, this.heroY - 28, `+${p.value} 气血`, '#1e8c6e', 16);
          this.sound.playXpPickup();
          this.emitHud();
        } else if (p.kind === 'magnet') {
          this.magnetizeAllPickups();
          this.sound.playLevelUp(false);
        } else {
          this.sound.playXpPickup();
          this.grantXp(p.value);
        }
      }
    }
  }

  private grantXp(amount: number): void {
    this.xp += amount;
    if (this.xp >= this.xpNext && this.phase === 'playing') {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = xpRequiredForLevel(this.level);
      this.pendingUpgradeChoices = rollUpgradeChoices(this.weapons, this.passives, Math.random, 3);
      const hasMythic = this.pendingUpgradeChoices.some((c) => c.isMythic);
      this.sound.playLevelUp(hasMythic);
      this.phase = 'levelup';
      this.clearAllInputs();
      this.emitHud();
      this.callbacks.onLevelUpChoices(this.pendingUpgradeChoices, this.rerollsLeft);
    }
  }

  private finishRun(victory: boolean): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.clearAllInputs();
    if (victory) this.sound.playOutcome(true);

    let bestElapsed = this.elapsedSec;
    try {
      const saved = Number(window.localStorage.getItem(BEST_TIME_KEY) || '0');
      if (Number.isFinite(saved) && saved > bestElapsed) {
        bestElapsed = saved;
      } else {
        window.localStorage.setItem(BEST_TIME_KEY, String(Math.floor(this.elapsedSec)));
      }
    } catch {
      // Ignore storage failures
    }

    const activeBoss = this.enemies.find((e) => !e.dying && e.archetype === 'boss_bloodlord');
    const summary: EndRunSummary = {
      victory,
      sectId: this.sectId,
      elapsedSec: this.elapsedSec,
      bestElapsedSec: bestElapsed,
      kills: this.kills,
      level: this.level,
      maxCombo: this.maxCombo,
      perfectDodges: this.perfectDodges,
      waveReached: getWaveDirectorConfig(this.elapsedSec).waveIndex,
      bossRemainingPct: activeBoss ? Math.max(0, Math.round((activeBoss.hp / activeBoss.maxHp) * 100)) : null,
      weapons: this.weapons.map((w) => ({ ...w })),
      passives: this.passives.map((p) => ({ ...p })),
    };

    this.emitHud();
    this.callbacks.onRunFinished(summary);
  }

  private showBanner(text: string, tone: 'gold' | 'crimson' | 'jade', duration: number): void {
    this.bannerText = text;
    this.bannerTone = tone;
    this.bannerTimer = duration;
  }

  private buildHudSnapshot(): HudSnapshot {
    const bossEntity = this.enemies.find((e) => !e.dying && (e.isBoss || e.isElite));
    const boss: ActiveBossHud | null = bossEntity
      ? {
          name: bossEntity.displayName ?? '强敌',
          title: bossEntity.displayTitle ?? '',
          hp: Math.max(0, Math.round(bossEntity.hp)),
          maxHp: bossEntity.maxHp,
          isFinalBoss: bossEntity.isBoss,
        }
      : null;

    const waveCfg = getWaveDirectorConfig(this.elapsedSec);
    return {
      hp: Math.round(this.heroHp),
      maxHp: Math.round(this.heroMaxHp),
      xp: Math.round(this.xp),
      xpNext: this.xpNext,
      level: this.level,
      elapsedSec: this.elapsedSec,
      kills: this.kills,
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfectDodges: this.perfectDodges,
      rerollsLeft: this.rerollsLeft,
      waveIndex: waveCfg.waveIndex,
      waveTitle: waveCfg.waveTitle,
      sectId: this.sectId,
      weapons: this.weapons.map((w) => ({ ...w })),
      passives: this.passives.map((p) => ({ ...p })),
      boss,
      bannerText: this.bannerText,
      bannerTone: this.bannerTone,
      dashReadyRatio:
        this.stats.dashCooldown > 0
          ? Math.max(0, Math.min(1, 1 - this.dashCooldownTimer / this.stats.dashCooldown))
          : 1,
    };
  }

  private emitHud(): void {
    this.callbacks.onHudUpdate(this.buildHudSnapshot());
  }

  // Zero-GC Pool Helpers
  private spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
    shape: ParticleSlot['shape']
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.75);
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = Math.sin(ang) * spd;
      slot.size = shape === 'ring' ? 12 + Math.random() * 14 : 3 + Math.random() * 4.5;
      slot.maxLife = shape === 'ring' ? 0.32 : 0.25 + Math.random() * 0.25;
      slot.life = slot.maxLife;
      slot.color = color;
      slot.shape = shape;
      slot.angle = ang;
      slot.spin = (Math.random() - 0.5) * 10;
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, size: number): void {
    const slot = this.floatingTexts[this.textCursor];
    this.textCursor = (this.textCursor + 1) % MAX_FLOATING_TEXTS;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vy = -44;
    slot.text = text;
    slot.color = color;
    slot.size = size;
    slot.maxLife = 0.68;
    slot.life = 0.68;
  }

  private spawnAfterimage(x: number, y: number, facing: number, color: string): void {
    const slot = this.afterimages[this.afterimageCursor];
    this.afterimageCursor = (this.afterimageCursor + 1) % MAX_AFTERIMAGES;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.facing = facing;
    slot.maxLife = 0.22;
    slot.life = 0.22;
    slot.color = color;
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 4.5;
      p.vy *= 1 - dt * 4.5;
      p.angle += p.spin * dt;
    }
  }

  private updateFloatingTexts(dt: number): void {
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      const t = this.floatingTexts[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 1 - dt * 3;
    }
  }

  private updateAfterimages(dt: number): void {
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const a = this.afterimages[i];
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) a.active = false;
    }
  }

  // ==================== INK-WASH & CEL-SHADED RENDERING ====================

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    if (!this.floorPattern) {
      ctx.fillStyle = '#cfc7b6';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.save();
    ctx.translate(
      this.width * 0.5 - this.camX + this.shakeX,
      this.height * 0.5 - this.camY + this.shakeY
    );

    this.renderCourtyardFloor(ctx);
    this.renderGroundZones(ctx);
    this.renderPickups(ctx);
    this.renderBreakables(ctx);
    this.renderAfterimages(ctx);
    this.renderTaijiOrbs(ctx);
    this.renderEnemies(ctx);
    this.renderHero(ctx);
    this.renderPlayerProjectiles(ctx);
    this.renderEnemyProjectiles(ctx);
    this.renderLightnings(ctx);
    this.renderParticles(ctx);
    this.renderAmbientLeaves(ctx);
    this.renderFloatingTexts(ctx);

    ctx.restore();
    ctx.restore();
  }

  private renderCourtyardFloor(ctx: CanvasRenderingContext2D): void {
    const left = this.camX - this.width * 0.56;
    const top = this.camY - this.height * 0.56;
    const w = this.width * 1.12;
    const h = this.height * 1.12;

    if (this.floorPattern) {
      ctx.fillStyle = this.floorPattern;
      ctx.fillRect(left, top, w, h);
    }

    // Carved Taiji courtyard medallions every 672px
    const medStep = 672;
    const mLeft = Math.floor((this.camX - this.width * 0.7) / medStep) * medStep;
    const mRight = Math.ceil((this.camX + this.width * 0.7) / medStep) * medStep;
    const mTop = Math.floor((this.camY - this.height * 0.7) / medStep) * medStep;
    const mBottom = Math.ceil((this.camY + this.height * 0.7) / medStep) * medStep;

    for (let mx = mLeft; mx <= mRight; mx += medStep) {
      for (let my = mTop; my <= mBottom; my += medStep) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.strokeStyle = 'rgba(60, 52, 42, 0.16)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 118, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 96, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -48, 48, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.arc(0, 48, 48, -Math.PI * 0.5, Math.PI * 0.5, true);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private renderGroundZones(ctx: CanvasRenderingContext2D): void {
    for (const z of this.groundZones) {
      ctx.save();
      ctx.translate(z.x, z.y);

      if (z.windup > 0) {
        // High-contrast telegraph warning ring!
        const progress = 1 - z.windup / z.maxWindup;
        const color = z.kind === 'enemy_venom' ? 'rgba(126, 34, 206, 0.2)' : 'rgba(201, 59, 43, 0.22)';
        const stroke = z.kind === 'enemy_venom' ? '#7e22ce' : '#c93b2b';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, z.radius * progress, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (z.kind === 'player_fire') {
        const alpha = Math.min(1, z.life / 0.5);
        const pulse = 1 + Math.sin(this.elapsedSec * 12 + z.x) * 0.05;
        ctx.globalAlpha = 0.78 * alpha;
        ctx.fillStyle = z.evolved ? 'rgba(220, 38, 38, 0.34)' : 'rgba(234, 88, 12, 0.28)';
        ctx.beginPath();
        ctx.arc(0, 0, z.radius * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = z.evolved ? '#b91c1c' : '#d9532f';
        ctx.lineWidth = z.evolved ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, z.radius * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Inner lotus/flame petals
        ctx.fillStyle = z.evolved ? 'rgba(250, 204, 21, 0.45)' : 'rgba(251, 146, 60, 0.4)';
        for (let k = 0; k < 5; k++) {
          const ang = this.elapsedSec * 2 + (Math.PI * 2 * k) / 5;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * z.radius * 0.36, Math.sin(ang) * z.radius * 0.36, z.radius * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Active enemy venom / slam
        const alpha = Math.min(1, z.life / 0.4);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = z.kind === 'enemy_venom' ? 'rgba(107, 33, 168, 0.35)' : 'rgba(201, 59, 43, 0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = z.kind === 'enemy_venom' ? '#581c87' : '#991b1b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderPickups(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pickups) {
      const bob = Math.sin(p.bobPhase) * 2.5;
      ctx.save();
      ctx.translate(p.x, p.y + bob);

      if (p.kind === 'bun_heal') {
        // Steamed Jianghu Baozi (回春包子)
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(0, 8 - bob, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#faf5e8';
        ctx.strokeStyle = '#231f20';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Green leaf garnish / cross
        ctx.fillStyle = '#1e8c6e';
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.fillRect(-1.5, -4, 3, 8);
      } else if (p.kind === 'magnet') {
        // Jade Qi Magnet Orb (吸星珠)
        ctx.fillStyle = '#0f766e';
        ctx.strokeStyle = '#f8f4ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#2dd4bf';
        ctx.beginPath();
        ctx.arc(0, 0, 14 + Math.sin(p.bobPhase * 2) * 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'scroll') {
        // Golden Secret Scroll (秘宝残卷)
        ctx.fillStyle = '#f5e6c4';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.fillRect(-9, -6, 18, 12);
        ctx.strokeRect(-9, -6, 18, 12);
        ctx.fillStyle = '#c93b2b';
        ctx.fillRect(-2, -6, 4, 12);
      } else {
        // Qi XP Orbs (真气珠 - diamond jade/gold crystal)
        const r = p.kind === 'xp_gold' ? 8 : p.kind === 'xp_mid' ? 6.5 : 5;
        ctx.fillStyle =
          p.kind === 'xp_gold' ? '#d99b26' : p.kind === 'xp_mid' ? '#0ea5e9' : '#1e8c6e';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.78, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.78, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private renderBreakables(ctx: CanvasRenderingContext2D): void {
    for (const prop of this.breakables) {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      // Ground shadow
      ctx.fillStyle = 'rgba(24, 20, 16, 0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 15, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      if (prop.kind === 'jar') {
        // Jianghu Wine Jar (女儿红酒坛)
        ctx.fillStyle = prop.hitFlash > 0 ? '#ffffff' : '#8b5e3c';
        ctx.strokeStyle = '#231f20';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(0, 2, 13, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Red cloth lid
        ctx.fillStyle = '#c93b2b';
        ctx.beginPath();
        ctx.ellipse(0, -10, 9, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Sealed Jianghu Treasure Chest (秘宝箱)
        ctx.fillStyle = prop.hitFlash > 0 ? '#ffffff' : '#7c3f1d';
        ctx.strokeStyle = '#231f20';
        ctx.lineWidth = 2.2;
        ctx.fillRect(-15, -11, 30, 22);
        ctx.strokeRect(-15, -11, 30, 22);
        ctx.fillStyle = '#d99b26';
        ctx.fillRect(-15, -2, 30, 4);
        ctx.fillRect(-4, -5, 8, 10);
      }
      ctx.restore();
    }
  }

  private renderAfterimages(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const a = this.afterimages[i];
      if (!a.active) continue;
      const alpha = (a.life / a.maxLife) * 0.42;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.facing, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.ellipse(0, 2, 12, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -15, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderHero(ctx: CanvasRenderingContext2D): void {
    const sect = SECTS[this.sectId];
    const bob = Math.abs(Math.sin(this.heroWalkPhase)) * 3.5;

    ctx.save();

    // 1. Gaze-routed Qinggong Dash Readiness Arc right under Hero's feet
    const readyRatio =
      this.stats.dashCooldown > 0
        ? Math.max(0, Math.min(1, 1 - this.dashCooldownTimer / this.stats.dashCooldown))
        : 1;
    ctx.save();
    ctx.translate(this.heroX, this.heroY + 17);
    ctx.strokeStyle = 'rgba(31, 28, 26, 0.25)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = readyRatio >= 0.99 ? '#1e8c6e' : '#d99b26';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0.22 * Math.PI, (0.22 + 0.56 * readyRatio) * Math.PI);
    ctx.stroke();
    ctx.restore();

    // 2. Fluttering Cinnabar/Gold Scarf Trail
    if (this.scarfNodes.length >= 2) {
      ctx.strokeStyle = '#1f1c1a';
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.scarfNodes[0].x, this.scarfNodes[0].y);
      for (let i = 1; i < this.scarfNodes.length; i++) {
        ctx.lineTo(this.scarfNodes[i].x, this.scarfNodes[i].y);
      }
      ctx.stroke();

      ctx.strokeStyle = sect.scarfColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(this.scarfNodes[0].x, this.scarfNodes[0].y);
      for (let i = 1; i < this.scarfNodes.length; i++) {
        ctx.lineTo(this.scarfNodes[i].x, this.scarfNodes[i].y);
      }
      ctx.stroke();
    }

    // 3. Ground Shadow
    ctx.fillStyle = 'rgba(24, 20, 16, 0.28)';
    ctx.beginPath();
    ctx.ellipse(this.heroX, this.heroY + 16, 15, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Q-Style Cel-Shaded Wuxia Hero Sprite
    ctx.translate(this.heroX, this.heroY - bob);
    ctx.scale(this.heroFacing * this.heroScaleX, this.heroScaleY);

    if (this.heroInvuln > 0 && Math.floor(this.elapsedSec * 22) % 2 === 0 && this.dashTimer <= 0) {
      ctx.globalAlpha = 0.65;
    }

    const flash = this.heroHitFlash > 0;

    // Back-slung weapon silhouette
    ctx.save();
    ctx.rotate(-0.45);
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#1f1c1a';
    ctx.lineWidth = 2;
    ctx.fillRect(-3, -24, 6, 36);
    ctx.strokeRect(-3, -24, 6, 36);
    ctx.fillStyle = '#d99b26';
    ctx.fillRect(-7, -14, 14, 4);
    ctx.restore();

    // Hanfu Robe Body
    ctx.fillStyle = flash ? '#ffffff' : sect.robeColor;
    ctx.strokeStyle = '#1f1c1a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-11, -5);
    ctx.lineTo(11, -5);
    ctx.lineTo(14, 14);
    ctx.lineTo(-14, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ivory Cross-Collar Trim
    ctx.strokeStyle = flash ? '#ffffff' : sect.trimColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(5, 8);
    ctx.moveTo(6, -4);
    ctx.lineTo(-2, 5);
    ctx.stroke();

    // Waist Sash
    ctx.fillStyle = sect.scarfColor;
    ctx.fillRect(-11, 4, 22, 4);

    // Head (Warm ivory skin)
    ctx.fillStyle = flash ? '#ffffff' : '#f7dfc4';
    ctx.strokeStyle = '#1f1c1a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -14, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ink Hair + Topknot (发髻)
    ctx.fillStyle = '#1f1c1a';
    ctx.beginPath();
    ctx.arc(0, -16, 10.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-1, -26, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Hairpin
    ctx.strokeStyle = '#d99b26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -26);
    ctx.lineTo(6, -26);
    ctx.stroke();

    // Expressive sharp eyes
    ctx.fillStyle = '#1f1c1a';
    ctx.fillRect(2, -15, 2.6, 3.2);
    ctx.fillRect(7, -15, 2.2, 3.2);

    ctx.restore();
  }

  private renderEnemies(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      // Telegraphs drawn in world space BEFORE enemy body
      if (!e.dying && e.aiState === 'windup') {
        if (e.archetype === 'crossbow') {
          ctx.save();
          ctx.strokeStyle = 'rgba(201, 59, 43, 0.85)';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(e.aimAngle) * 380, Math.sin(e.aimAngle) * 380);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        } else if (e.archetype === 'charger' || ((e.isBoss || e.isElite) && e.bossPattern === 2)) {
          ctx.save();
          ctx.rotate(e.aimAngle);
          const len = e.isBoss ? 250 : 195;
          ctx.fillStyle = 'rgba(201, 59, 43, 0.22)';
          ctx.fillRect(0, -e.radius * 0.85, len, e.radius * 1.7);
          ctx.strokeStyle = '#c93b2b';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, -e.radius * 0.85, len, e.radius * 1.7);
          ctx.restore();
        } else if ((e.isBoss || e.isElite) && e.bossPattern === 0) {
          // Radial fan sightlines
          const count = e.isBoss ? 9 : 5;
          ctx.strokeStyle = 'rgba(201, 59, 43, 0.6)';
          ctx.lineWidth = 1.6;
          for (let k = 0; k < count; k++) {
            const ang = e.aimAngle + (k - (count - 1) / 2) * 0.24;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * 240, Math.sin(ang) * 240);
            ctx.stroke();
          }
        }
      }

      if (e.dying) {
        const frac = Math.max(0, e.koTimer / 0.32);
        ctx.globalAlpha = frac;
        ctx.rotate((1 - frac) * 1.4 * e.facing);
        ctx.scale(0.8 + frac * 0.2, 0.8 + frac * 0.2);
      }

      // Ground shadow
      ctx.fillStyle = 'rgba(20, 16, 12, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, e.radius * 0.85, e.radius * 0.9, e.radius * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      const bob = e.dying ? 0 : Math.abs(Math.sin(e.walkPhase)) * 3;
      ctx.translate(0, -bob);
      ctx.scale(e.facing, 1);

      const flash = e.hitFlash > 0;
      const chilled = e.slowTimer > 0 && !flash;

      if (e.archetype === 'bandit') {
        // Bandit Swarmer with Bamboo Conical Hat (斗笠山贼)
        ctx.fillStyle = flash ? '#ffffff' : chilled ? '#60a5fa' : '#4a4238';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(-10, -6, 20, 18, 4);
        ctx.fill();
        ctx.stroke();
        // Conical bamboo hat
        ctx.fillStyle = flash ? '#ffffff' : '#c8a96e';
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(17, -9);
        ctx.lineTo(-17, -9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Saber blade
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(9, 2);
        ctx.lineTo(20, -6);
        ctx.stroke();
      } else if (e.archetype === 'crossbow') {
        // Crossbow Kiter (暗器弩手)
        ctx.fillStyle = flash ? '#ffffff' : chilled ? '#60a5fa' : '#2d3748';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(-9, -6, 18, 17, 4);
        ctx.fill();
        ctx.stroke();
        // Hooded head + crimson band
        ctx.fillStyle = flash ? '#ffffff' : '#1a202c';
        ctx.beginPath();
        ctx.arc(0, -13, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c93b2b';
        ctx.fillRect(-8, -16, 16, 3);
        // Crossbow arm
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(6, -1);
        ctx.lineTo(18, -1);
        ctx.moveTo(14, -7);
        ctx.lineTo(14, 5);
        ctx.stroke();
      } else if (e.archetype === 'charger') {
        // Armored Charger (铁甲校尉)
        ctx.fillStyle = flash ? '#ffffff' : chilled ? '#60a5fa' : '#3f3f46';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-15, -10, 30, 24, 5);
        ctx.fill();
        ctx.stroke();
        // Iron pauldrons & horned helmet
        ctx.fillStyle = flash ? '#ffffff' : '#71717a';
        ctx.beginPath();
        ctx.arc(0, -16, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c93b2b';
        ctx.beginPath();
        ctx.moveTo(-4, -26);
        ctx.lineTo(0, -34);
        ctx.lineTo(4, -26);
        ctx.closePath();
        ctx.fill();
      } else if (e.archetype === 'venom') {
        // Venom Orbiter (毒雾方士)
        ctx.fillStyle = flash ? '#ffffff' : chilled ? '#60a5fa' : '#4c1d95';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-11, -6);
        ctx.lineTo(11, -6);
        ctx.lineTo(14, 14);
        ctx.lineTo(-14, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Taoist crown + pale mask
        ctx.fillStyle = '#ede9fe';
        ctx.beginPath();
        ctx.arc(0, -14, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#6b21a8';
        ctx.fillRect(-5, -26, 10, 6);
      } else {
        // Elite Guard or Final Boss Bloodlord (锦衣千户 / 血煞教主)
        const s = e.isBoss ? 1.38 : 1.08;
        ctx.scale(s, s);
        // Flowing crimson demonic cape
        ctx.fillStyle = flash ? '#ffffff' : e.isBoss ? '#7f1d1d' : '#9a3412';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-16, -12);
        ctx.lineTo(16, -12);
        ctx.lineTo(22, 18);
        ctx.lineTo(-22, 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Gold armor breastplate
        ctx.fillStyle = flash ? '#ffffff' : '#1f1c1a';
        ctx.fillRect(-13, -10, 26, 22);
        ctx.strokeStyle = '#d99b26';
        ctx.lineWidth = 2;
        ctx.strokeRect(-10, -7, 20, 15);
        // Boss Head + Golden Crown
        ctx.fillStyle = flash ? '#ffffff' : '#f1d2b6';
        ctx.strokeStyle = '#1f1c1a';
        ctx.beginPath();
        ctx.arc(0, -19, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#d99b26';
        ctx.beginPath();
        ctx.moveTo(-11, -24);
        ctx.lineTo(-7, -34);
        ctx.lineTo(0, -28);
        ctx.lineTo(7, -34);
        ctx.lineTo(11, -24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Windup exclamation cue above head
      if (!e.dying && e.aiState === 'windup') {
        ctx.scale(e.facing, 1); // Unflip text
        ctx.fillStyle = '#c93b2b';
        ctx.font = '900 18px "Noto Serif SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, -e.radius - 16);
      }

      ctx.restore();

      // Compact in-world HP bar for damaged non-boss enemies
      if (!e.dying && !e.isBoss && e.hp < e.maxHp) {
        const bw = e.isElite ? 44 : 26;
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(24, 20, 16, 0.72)';
        ctx.fillRect(e.x - bw * 0.5, e.y + e.radius + 7, bw, 4);
        ctx.fillStyle = e.isElite ? '#d99b26' : '#c93b2b';
        ctx.fillRect(e.x - bw * 0.5, e.y + e.radius + 7, bw * pct, 4);
      }
    }
  }

  private renderTaijiOrbs(ctx: CanvasRenderingContext2D): void {
    const taiji = this.weapons.find((w) => w.id === 'taiji_chakram');
    if (!taiji) return;

    const count = taiji.evolved ? 6 : Math.min(5, 1 + taiji.level);
    const orbitRadius = (taiji.evolved ? 102 : 72 + taiji.level * 6) * this.stats.areaMult;
    const orbSize = (taiji.evolved ? 16 : 11 + taiji.level * 0.7) * this.stats.areaMult;

    // Subtle Bagua ring aura when evolved
    if (taiji.evolved) {
      ctx.save();
      ctx.translate(this.heroX, this.heroY);
      ctx.rotate(-this.taijiAngle * 0.6);
      ctx.strokeStyle = 'rgba(30, 140, 110, 0.42)';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, orbitRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    for (let i = 0; i < count; i++) {
      const ang = this.taijiAngle + (Math.PI * 2 * i) / count;
      const ox = this.heroX + Math.cos(ang) * orbitRadius;
      const oy = this.heroY + Math.sin(ang) * orbitRadius;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(this.taijiAngle * 2.5);

      ctx.fillStyle = taiji.evolved ? '#1e8c6e' : '#1f1c1a';
      ctx.strokeStyle = taiji.evolved ? '#d99b26' : '#f3ebd8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, orbSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Yin-Yang light half
      ctx.fillStyle = '#f8f4ea';
      ctx.beginPath();
      ctx.arc(0, 0, orbSize - 1, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fill();

      ctx.fillStyle = '#1f1c1a';
      ctx.beginPath();
      ctx.arc(0, -orbSize * 0.45, orbSize * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8f4ea';
      ctx.beginPath();
      ctx.arc(0, orbSize * 0.45, orbSize * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private renderPlayerProjectiles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.playerProjectiles) {
      ctx.save();

      if (p.weaponId === 'flying_sword') {
        // Ink-wash sword trail
        ctx.strokeStyle = p.evolved ? 'rgba(217, 155, 38, 0.5)' : 'rgba(44, 138, 122, 0.42)';
        ctx.lineWidth = p.evolved ? 8 : 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(p.rotation) * 28, p.y - Math.sin(p.rotation) * 28);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.evolved ? '#facc15' : '#e6f4f1';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-10, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (p.weaponId === 'storm_fan') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const r = p.radius;
        if (p.evolved) {
          ctx.fillStyle = 'rgba(201, 59, 43, 0.2)';
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
        // Folding Paper Fan silhouette
        ctx.fillStyle = p.evolved ? '#c93b2b' : '#f5ebd6';
        ctx.strokeStyle = '#1f1c1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -0.9, 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Vermilion trim
        ctx.strokeStyle = p.evolved ? '#facc15' : '#c93b2b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.82, -0.82, 0.82);
        ctx.stroke();
      } else if (p.weaponId === 'frost_shuriken') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const r = p.radius;
        ctx.fillStyle = p.evolved ? '#38bdf8' : '#e0f2fe';
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (Math.PI * 0.5) * k;
          ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
          ctx.lineTo(Math.cos(a + 0.4) * r * 0.35, Math.sin(a + 0.4) * r * 0.35);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private renderEnemyProjectiles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.enemyProjectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#1f1c1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef2f2';
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, p.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderLightnings(ctx: CanvasRenderingContext2D): void {
    for (const l of this.lightnings) {
      const alpha = Math.max(0, l.timer / l.maxTimer);
      ctx.save();
      ctx.globalAlpha = alpha;

      // Ground talisman blast ring
      ctx.strokeStyle = l.evolved ? '#facc15' : '#eab308';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius * (1.15 - alpha * 0.2), 0, Math.PI * 2);
      ctx.stroke();

      // Jagged sky bolt
      ctx.strokeStyle = '#fffbeb';
      ctx.lineWidth = l.evolved ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(l.x + 12, l.y - 240);
      ctx.lineTo(l.x - 16, l.y - 160);
      ctx.lineTo(l.x + 14, l.y - 80);
      ctx.lineTo(l.x, l.y);
      ctx.stroke();

      ctx.strokeStyle = l.evolved ? '#d99b26' : '#ca8a04';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (l.chainFromX !== undefined && l.chainFromY !== undefined) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(l.chainFromX, l.chainFromY);
        ctx.lineTo((l.chainFromX + l.x) * 0.5 + 12, (l.chainFromY + l.y) * 0.5 - 12);
        ctx.lineTo(l.x, l.y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const frac = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = frac;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (2.6 - frac * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'slash') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 1.8, -1.6, p.size * 3.6, 3.2);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * frac, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderAmbientLeaves(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const leaf of this.ambientLeaves) {
      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(leaf.angle);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = leaf.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, leaf.size * 1.4, leaf.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private renderFloatingTexts(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      const t = this.floatingTexts[i];
      if (!t.active) continue;
      const frac = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = Math.min(1, frac * 1.6);
      ctx.font = `700 ${t.size}px "JetBrains Mono", "Noto Serif SC", sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(24, 20, 16, 0.9)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
