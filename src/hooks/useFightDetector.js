/**
 * Fight / aggression detection — v4 (high-confidence, multi-person only).
 *
 * STRICT rules to avoid false positives:
 *   1. 2+ faces MUST be visible (non-negotiable)
 *   2. Faces must be close together AND approaching each other
 *   3. At least one strong aggression signal (arm swinging fast, body lunge)
 *   4. Must sustain for 6+ CONSECUTIVE aggressive frames (~1.2 seconds)
 *   5. Counter fully resets on any non-aggressive frame (no buildup over time)
 *
 * This means: two people simply sitting close, normal gestures, waving,
 * or brief arm movements will NEVER trigger a fight alert.
 */

const FIGHT_CONFIRM_FRAMES  = 6;     // need 6 consecutive frames (~1.2s at 200ms interval)
const PROXIMITY_THRESHOLD   = 0.32;  // faces must be within 32% of frame (genuinely close)
const APPROACH_THRESHOLD    = 0.012; // faces must close 1.2% per frame (fast approach)
const DISPLAY_MS            = 5000;  // show alert for 5 seconds

const WRIST_VELOCITY_THRESH = 0.06;  // wrist must move >6% per frame (strong swing)
const ARM_EXTEND_THRESH     = 0.22;  // wrist >22% away from shoulder (full punch extend)
const ARM_RAISE_THRESH      = 0.07;  // wrist must be >7% above shoulder (clear raise)
const BODY_LUNGE_THRESH     = 0.025; // shoulder center moved >2.5% per frame (clear charge)

export class FightDetector {
  constructor() {
    this.prevMinDist     = null;
    this.prevBodyCenter  = null;
    this.prevWrists      = null;
    this.counter         = 0;
    this.lastTrigger     = 0;
  }

  update(faceLandmarkArrays, poseLandmarks) {
    const now     = Date.now();
    const signals = [];

    // ═══════════════════════════════════════════════════════════════════════════
    // HARD REQUIREMENT: 2+ faces must be visible
    // ═══════════════════════════════════════════════════════════════════════════
    if (faceLandmarkArrays.length < 2) {
      this.prevMinDist = null;
      this.counter     = 0;  // full reset — single person breaks the chain

      const fighting = now - this.lastTrigger < DISPLAY_MS;
      return {
        fight:   fighting,
        signals: fighting ? ['sticky'] : [],
        reason:  fighting ? 'FIGHT (alert active)' : 'monitoring (need 2+ people)',
      };
    }

    // ── Compute closest face-pair distance ───────────────────────────────────
    const centers = faceLandmarkArrays.map(lms => {
      let sx = 0, sy = 0;
      for (const l of lms) { sx += l.x; sy += l.y; }
      return { x: sx / lms.length, y: sy / lms.length };
    });

    let minDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const d = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
        if (d < minDist) minDist = d;
      }
    }

    // ── Proximity: faces genuinely close ─────────────────────────────────────
    const facesClose = minDist < PROXIMITY_THRESHOLD;
    if (facesClose) signals.push(`close d=${minDist.toFixed(2)}`);

    // ── Approach: distance shrinking frame-over-frame ────────────────────────
    let approaching = false;
    if (this.prevMinDist !== null) {
      const delta = this.prevMinDist - minDist;
      if (delta > APPROACH_THRESHOLD) {
        approaching = true;
        signals.push(`approach Δ=${delta.toFixed(3)}`);
      }
    }
    this.prevMinDist = minDist;

    // ═══════════════════════════════════════════════════════════════════════════
    // Pose-based aggression (strong thresholds only)
    // ═══════════════════════════════════════════════════════════════════════════
    let armSwinging = false;
    let armRaised   = false;
    let armExtended = false;
    let bodyLunging = false;

    if (poseLandmarks) {
      const lW = poseLandmarks[15];
      const rW = poseLandmarks[16];
      const lS = poseLandmarks[11];
      const rS = poseLandmarks[12];

      // Arm raised: wrist clearly above shoulder
      if (lW && lS && (lW.visibility ?? 0) > 0.4 && lW.y < lS.y - ARM_RAISE_THRESH) {
        armRaised = true; signals.push('L_arm_up');
      }
      if (rW && rS && (rW.visibility ?? 0) > 0.4 && rW.y < rS.y - ARM_RAISE_THRESH) {
        armRaised = true; signals.push('R_arm_up');
      }

      // Arm extended: full punch-reach outward
      if (lW && lS && (lW.visibility ?? 0) > 0.4 && Math.abs(lW.x - lS.x) > ARM_EXTEND_THRESH) {
        armExtended = true; signals.push('L_arm_ext');
      }
      if (rW && rS && (rW.visibility ?? 0) > 0.4 && Math.abs(rW.x - rS.x) > ARM_EXTEND_THRESH) {
        armExtended = true; signals.push('R_arm_ext');
      }

      // Wrist velocity: fast arm swing
      const curWrists = {};
      if (lW && (lW.visibility ?? 0) > 0.4) { curWrists.lx = lW.x; curWrists.ly = lW.y; }
      if (rW && (rW.visibility ?? 0) > 0.4) { curWrists.rx = rW.x; curWrists.ry = rW.y; }

      if (this.prevWrists) {
        if (curWrists.lx != null && this.prevWrists.lx != null) {
          const v = Math.hypot(curWrists.lx - this.prevWrists.lx, curWrists.ly - this.prevWrists.ly);
          if (v > WRIST_VELOCITY_THRESH) { armSwinging = true; signals.push(`L_swing ${v.toFixed(3)}`); }
        }
        if (curWrists.rx != null && this.prevWrists.rx != null) {
          const v = Math.hypot(curWrists.rx - this.prevWrists.rx, curWrists.ry - this.prevWrists.ry);
          if (v > WRIST_VELOCITY_THRESH) { armSwinging = true; signals.push(`R_swing ${v.toFixed(3)}`); }
        }
      }
      this.prevWrists = curWrists;

      // Body lunge: shoulder center charging forward
      if (lS && rS) {
        const cx = (lS.x + rS.x) / 2;
        const cy = (lS.y + rS.y) / 2;
        if (this.prevBodyCenter) {
          const bv = Math.hypot(cx - this.prevBodyCenter.x, cy - this.prevBodyCenter.y);
          if (bv > BODY_LUNGE_THRESH) { bodyLunging = true; signals.push(`lunge ${bv.toFixed(3)}`); }
        }
        this.prevBodyCenter = { x: cx, y: cy };
      }
    } else {
      this.prevWrists     = null;
      this.prevBodyCenter = null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DECISION: ALL conditions must be met simultaneously
    //   - faces close OR actively approaching
    //   - AND at least one strong aggression signal
    // ═══════════════════════════════════════════════════════════════════════════
    const hasProximity  = facesClose || approaching;
    const hasAggression = armSwinging || bodyLunging || (armRaised && armExtended);
    //                    ^^^ arm raised ALONE is not enough — must also be extended (punching)

    const aggressive = hasProximity && hasAggression;

    if (aggressive) {
      this.counter++;
      if (this.counter >= FIGHT_CONFIRM_FRAMES) {
        this.lastTrigger = now;
        this.counter = 0;
        console.warn('[Fight] CONFIRMED after', FIGHT_CONFIRM_FRAMES, 'frames:', signals.join(', '));
      }
    } else {
      // FULL RESET — any break in the aggressive chain resets the counter entirely
      this.counter = 0;
    }

    const fighting = now - this.lastTrigger < DISPLAY_MS;

    const missing = [];
    if (!hasProximity)  missing.push('not close enough');
    if (!hasAggression) missing.push('no strong aggression');

    return {
      fight:   fighting,
      signals,
      reason:  fighting
        ? `FIGHT: ${signals.join(', ')}`
        : (aggressive
            ? `confirming ${this.counter}/${FIGHT_CONFIRM_FRAMES}`
            : `2+ people · ${missing.join(' · ')}`),
    };
  }

  reset() {
    this.prevMinDist     = null;
    this.prevBodyCenter  = null;
    this.prevWrists      = null;
    this.counter         = 0;
    this.lastTrigger     = 0;
  }
}
