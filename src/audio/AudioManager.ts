import { GameSettings, WeaponClass } from '../types/game';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientOsc1: OscillatorNode | null = null;
  private ambientOsc2: OscillatorNode | null = null;
  private isPaused = false;
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended' && !this.isPaused) {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.isPaused ? 0 : this.settings.masterVolume, now, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.02);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * 0.16, now, 0.05);
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.applyVolumes();
  }

  public startAmbientDrone(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain || this.ambientOsc1) return;

    try {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      filter.connect(this.musicGain);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.value = 55; // A1 tactical sub-drone
      osc2.frequency.value = 82.41; // E2 fifth

      osc1.connect(filter);
      osc2.connect(filter);
      osc1.start();
      osc2.start();
      this.ambientOsc1 = osc1;
      this.ambientOsc2 = osc2;
    } catch {
      // Ignore if blocked before gesture
    }
  }

  public stopAmbientDrone(): void {
    try {
      this.ambientOsc1?.stop();
      this.ambientOsc2?.stop();
    } catch {}
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playWeaponFire(weaponClass: WeaponClass, isEnemy = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const attenuation = isEnemy ? 0.38 : 1.0;

    // Noise burst for transient gunshot crack
    const duration =
      weaponClass === WeaponClass.PrecisionRifle
        ? 0.34
        : weaponClass === WeaponClass.Shotgun
          ? 0.28
          : weaponClass === WeaponClass.Sidearm
            ? 0.11
            : 0.16;

    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      weaponClass === WeaponClass.Sidearm
        ? 1800
        : weaponClass === WeaponClass.SubmachineGun
          ? 1450
          : weaponClass === WeaponClass.Shotgun
            ? 720
            : weaponClass === WeaponClass.PrecisionRifle
              ? 950
              : 1150,
      now
    );
    filter.Q.value = 0.9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.65 * attenuation, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    noise.start(now);

    // Low-end punch oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    const startFreq =
      weaponClass === WeaponClass.Shotgun
        ? 140
        : weaponClass === WeaponClass.PrecisionRifle
          ? 165
          : weaponClass === WeaponClass.Sidearm
            ? 240
            : 185;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.09);

    oscGain.gain.setValueAtTime(0.55 * attenuation, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playDryFire(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.03);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playReload(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;

    // Mag release click + bolt rack
    [0, 0.35, 0.85].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 2 ? 620 : 440 + idx * 90, now + offset);
      osc.frequency.exponentialRampToValueAtTime(220, now + offset + 0.06);
      gain.gain.setValueAtTime(0.2, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  public playWeaponSwitch(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.05);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playFootstep(sprinting: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, 0.055);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sprinting ? 480 : 320;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(sprinting ? 0.16 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  public playJumpLand(isLand: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isLand ? 120 : 150, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    gain.gain.setValueAtTime(isLand ? 0.25 : 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playHitMarker(isHeadshot: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeadshot ? 1950 : 1320, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2600 : 880, now + 0.045);
    gain.gain.setValueAtTime(isHeadshot ? 0.28 : 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, 0.85);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(75, now + 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  public playPlayerDamage(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playEnemyAlert(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.isPaused) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.setValueAtTime(760, now + 0.06);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playObjectiveComplete(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.22, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.24);
    });
  }

  public playMenuClick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(840, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.03);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public dispose(): void {
    this.stopAmbientDrone();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
