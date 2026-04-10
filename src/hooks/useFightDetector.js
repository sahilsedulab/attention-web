/**
 * Fight / aggression detection — v3 (strict, multi-person only).
 *
 * ONLY triggers when 2+ people are detected AND one is approaching
 * the other aggressively. Single-person actions are never flagged.
 *
 * Detection logic:
 *   1. REQUIREMENT: 2+ faces must be visible (non-negotiable).
 *   2. Faces must be close together OR actively closing distance.
 *   3. At least one aggressive body signal:
 *      - Rapid wrist/arm movement (hitting/swinging)
 *      - Arm raised or extended toward the other person
 *      - Rapid body lunging (shoulder center moving fast)
 *
 * Anti-false-positive:
 *   - Needs CONFIRM_FRAMES consecutive aggressive frames before alert
 *   - "Closing distance" is tracked across frames to detect approach
 *   - Normal gestures (waving, stretching) won't trigger because they
 *     lack the proximity + approach component
 *
 * Sticky display: once triggered, stays true for DISPLAY_MS.
 */

const FIGHT_CONFIRM_FRAMES  = 3;     // need 3 consecutive aggressive frames
const PROXIMITY_THRESHOLD   = 0.40;  // faces within 40% of frame width = "close"
const APPROACH_THRESHOLD    = 0.008; // faces got 0.8% closer per frame = "approaching"
const DISPLAY_MS            = 6000;  // show alert for 6 seconds

const WRIST_VELOCITY_THRESH = 0.045; // wrist moved >4.5% per frame = swinging
const BODY_LUNGE_THRESH     = 0.018; // shoulder center moved >1.8% per frame

export class FightDetector {
  constructor() {
    this.prevFaceCenters = null;  // [{x, y, size}]
    this.prevMinDist     = null;  // closest face-pair distance last frame
    this.prevBodyCenter  = null;  // {x, y}
    this.prevWrists      = null;  // {lx, ly, rx, ry}
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
      // Single person — never flag, reset approach tracking
      this.prevFaceCenters = null;
      this.prevMinDist     = null;
      this.counter = Math.max(0, this.counter - 1);

      const fighting = now - this.lastTrigger < DISPLAY_MS;
      return {
        fight:   fighting,
        signals: fighting ? ['sticky'] : [],
        reason:  fighting
          ? 'FIGHT (alert active)'
          : 'monitoring (need 2+ people)',
      };
    }

    // ── Compute face centers and pairwise distances ──────────────────────────
    const centers = faceLandmarkArrays.map(lms => {
      let sx = 0, sy = 0;
      for (const l of lms) { sx += l.x; sy += l.y; }
      return { x: sx / lms.length, y: sy / lms.length };
    });

    // Find the closest pair of faces
    let minDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const d = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
        if (d < minDist) minDist = d;
      }
    }

    // ── Signal 1: Faces are already close ───────────────────────────────────
    const facesClose = minDist < PROXIMITY_THRESHOLD;
    if (facesClose) signals.push(`close d=${minDist.toFixed(2)}`);

    // ── Signal 2: Faces are approaching (distance shrinking) ────────────────
    let approaching = false;
    if (this.prevMinDist !== null) {
      const distDelta = this.prevMinDist - minDist; // positive = getting closer
      if (distDelta > APPROACH_THRESHOLD) {
        approaching = true;
        signals.push(`approach Δ=${distDelta.toFixed(3)}`);
      }
    }
    this.prevMinDist = minDist;
    this.prevFaceCenters = centers;

    // ── Signal 3: Rapid face movement (any face jittering fast) ─────────────
    // Not used for decision alone, but amplifies other signals

    // ═══════════════════════════════════════════════════════════════════════════
    // Pose-based aggression signals (from the single detected skeleton)
    // ═══════════════════════════════════════════════════════════════════════════
    let armRaised     = false;
    let armExtended   = false;
    let armSwinging   = false;
    let bodyLunging   = false;

    if (poseLandmarks) {
      const lW = poseLandmarks[15]; // left wrist
      const rW = poseLandmarks[16]; // right wrist
      const lS = poseLandmarks[11]; // left shoulder
      const rS = poseLandmarks[12]; // right shoulder

      // ── Raised arm: wrist significantly above shoulder ──
      if (lW && lS && (lW.visibility ?? 0) > 0.35 && lW.y < lS.y - 0.05) {
        armRaised = true; signals.push('L_arm_up');
      }
      if (rW && rS && (rW.visibility ?? 0) > 0.35 && rW.y < rS.y - 0.05) {
        armRaised = true; signals.push('R_arm_up');
      }

      // ── Arm extended outward: wrist far from shoulder horizontally ──
      if (lW && lS && (lW.visibility ?? 0) > 0.35) {
        const hDist = Math.abs(lW.x - lS.x);
        if (hDist > 0.18) { armExtended = true; signals.push('L_arm_ext'); }
      }
      if (rW && rS && (rW.visibility ?? 0) > 0.35) {
        const hDist = Math.abs(rW.x - rS.x);
        if (hDist > 0.18) { armExtended = true; signals.push('R_arm_ext'); }
      }

      // ── Wrist velocity: arm swinging (hitting motion) ──
      const curWrists = {};
      if (lW && (lW.visibility ?? 0) > 0.35) { curWrists.lx = lW.x; curWrists.ly = lW.y; }
      if (rW && (rW.visibility ?? 0) > 0.35) { curWrists.rx = rW.x; curWrists.ry = rW.y; }

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

      // ── Body lunging: shoulder center moving fast (charging at someone) ──
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
    // DECISION: requires proximity/approach + aggressive action
    // ═══════════════════════════════════════════════════════════════════════════
    const hasAggression = armRaised || armExtended || armSwinging || bodyLunging;
    const hasProximity  = facesClose || approaching;

    // Fight = 2+ people (already checked) + proximity/approach + aggression
    const aggressive = hasProximity && hasAggression;

    if (aggressive) {
      this.counter++;
      if (this.counter >= FIGHT_CONFIRM_FRAMES) {
        this.lastTrigger = now;
        this.counter     = 0;
        console.warn('[Fight] DETECTED:', signals.join(', '));
      }
    } else {
      // Decay counter slowly — don't reset instantly (brief occlusion shouldn't reset)
      this.counter = Math.max(0, this.counter - 1);
    }

    const fighting = now - this.lastTrigger < DISPLAY_MS;

    // Build debug reason
    const missing = [];
    if (!hasProximity)  missing.push('people not close enough');
    if (!hasAggression) missing.push('no aggressive action');

    return {
      fight:   fighting,
      signals,
      reason:  fighting
        ? `FIGHT: ${signals.join(', ')}`
        : (aggressive
            ? `confirming ${this.counter}/${FIGHT_CONFIRM_FRAMES}: ${signals.join(', ')}`
            : `2+ people seen · ${missing.join(' · ')}`),
    };
  }

  reset() {
    this.prevFaceCenters = null;
    this.prevMinDist     = null;
    this.prevBodyCenter  = null;
    this.prevWrists      = null;
    this.counter         = 0;
    this.lastTrigger     = 0;
  }
}
