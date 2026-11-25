// Procedural Chinese Pentatonic Web Audio Synth for 侠影五千年
// Uses C-D-E-G-A pentatonic intervals for tactile guzheng, woodblock, wind-slice & gong SFX.

const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

export class WuxiaSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private xpStep = 0;
  private lastXpTime = 0;
  private lastHitTime = 0;
  private lastSwingTime = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playXpPickup(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastXpTime < 0.045) return;
    if (now - this.lastXpTime > 0.6) {
      this.xpStep = 0;
    } else {
      this.xpStep = (this.xpStep + 1) % PENTATONIC_HZ.length;
    }
    this.lastXpTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = PENTATONIC_HZ[this.xpStep] * (0.97 + Math.random() * 0.06);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.12, now + 0.07);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playWeaponCast(style: 'sword' | 'fan' | 'thunder' | 'fire' | 'ice'): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastSwingTime < 0.055) return;
    this.lastSwingTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.92 + Math.random() * 0.16;

    if (style === 'sword') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(760 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(240 * jitter, now + 0.08);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    } else if (style === 'fan') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(520 * jitter, now + 0.09);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    } else if (style === 'thunder') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(210 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.18);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    } else if (style === 'fire') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(72, now + 0.16);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1280 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(860 * jitter, now + 0.07);
      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playHit(isCrit: boolean, isKill: boolean): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!isCrit && !isKill && now - this.lastHitTime < 0.04) return;
    this.lastHitTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.94 + Math.random() * 0.12;

    if (isCrit) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.11);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime((isKill ? 260 : 210) * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(82, now + 0.065);
      gain.gain.setValueAtTime(isKill ? 0.06 : 0.036, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playDash(isPerfect: boolean): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Wind whoosh
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.11);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);

    if (isPerfect) {
      // Golden Qi bell chime for 身法破招
      [783.99, 1174.66].forEach((freq, idx) => {
        const bell = ctx.createOscillator();
        const bg = ctx.createGain();
        bell.type = 'sine';
        bell.frequency.setValueAtTime(freq, now + idx * 0.035);
        bg.gain.setValueAtTime(0.095, now + idx * 0.035);
        bg.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.035 + 0.36);
        bell.connect(bg);
        bg.connect(ctx.destination);
        bell.start(now + idx * 0.035);
        bell.stop(now + idx * 0.035 + 0.38);
      });
    }
  }

  public playTelegraph(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.linearRampToValueAtTime(420, now + 0.16);
    gain.gain.setValueAtTime(0.032, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playPlayerHurt(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playLevelUp(isMythic = false): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = isMythic
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(isMythic ? 0.1 : 0.075, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  public playBossArrival(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Deep Wuxia war drum + brass gong shimmer
    [0, 0.22].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 115 : 88, now + offset);
      osc.frequency.exponentialRampToValueAtTime(38, now + offset + 0.45);
      gain.gain.setValueAtTime(0.16, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.52);
    });
  }

  public playOutcome(victory: boolean): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = victory
      ? [523.25, 659.25, 783.99, 880.0, 1046.5]
      : [440.0, 392.0, 329.63, 261.63];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = victory ? 'triangle' : 'sine';
      const start = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.085, start);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }
}
