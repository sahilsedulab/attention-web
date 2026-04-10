/**
 * Phone detection using COCO-SSD (full mobilenet_v2 for better accuracy).
 *
 * - Uses mobilenet_v2 (more accurate than lite variant)
 * - Detects "cell phone" AND "remote" (COCO-SSD often misclassifies phones as remotes)
 * - Sticky detection: once detected, stays "detected" for STICKY_MS
 * - Multiple confidence thresholds: lower for "cell phone", slightly higher for "remote"
 */
import { useEffect, useState } from 'react';

const STICKY_MS        = 3000;  // keep "detected" for 3s after last positive
const PHONE_CONFIDENCE = 0.18;  // cell phone threshold — low for good recall
const REMOTE_CONFIDENCE = 0.25; // remote threshold — slightly higher to avoid false positives

// Classes that indicate a phone-like handheld device
const PHONE_CLASSES = new Set(['cell phone', 'remote']);

let _model       = null;
let _loading     = false;
let _ready       = false;
const _callbacks = [];

// Sticky state at module level (shared across hook instances)
let _lastDetected   = 0;
let _lastResult     = { detected: false, boxes: [], reason: 'init' };

// Reusable offscreen canvas for downscaling (faster inference)
let _offCanvas = null;
let _offCtx    = null;
const DETECT_WIDTH  = 320;
const DETECT_HEIGHT = 240;

async function _init() {
  if (_ready || _loading) return;
  _loading = true;
  try {
    const tf      = await import('@tensorflow/tfjs');
    const cocoSsd = await import('@tensorflow-models/coco-ssd');

    if (tf.getBackend() !== 'webgl') {
      try { await tf.setBackend('webgl'); } catch { /* keep current */ }
      await tf.ready();
    }

    // Full mobilenet_v2: better accuracy for phone detection
    _model = await cocoSsd.load({ base: 'mobilenet_v2' });

    // Create offscreen canvas for downscaling
    _offCanvas = document.createElement('canvas');
    _offCanvas.width  = DETECT_WIDTH;
    _offCanvas.height = DETECT_HEIGHT;
    _offCtx = _offCanvas.getContext('2d');

    // Warmup with offscreen canvas
    await _model.detect(_offCanvas);

    _ready   = true;
    _loading = false;
    console.log('[COCO-SSD] ready ✅  backend:', tf.getBackend(), '(mobilenet_v2)');
    _callbacks.forEach(cb => cb());
    _callbacks.length = 0;
  } catch (e) {
    _loading = false;
    console.error('[COCO-SSD] load error:', e.message);
  }
}

_init();

export function usePhoneDetector() {
  const [ready, setReady] = useState(_ready);

  useEffect(() => {
    if (_ready) { setReady(true); return; }
    const cb = () => setReady(true);
    _callbacks.push(cb);
    return () => {
      const i = _callbacks.indexOf(cb);
      if (i >= 0) _callbacks.splice(i, 1);
    };
  }, []);

  const detect = async (imageElement) => {
    if (!_model || !imageElement) {
      return { detected: false, boxes: [], reason: _loading ? 'loading...' : 'not ready' };
    }
    try {
      // Downscale to 320x240 for faster inference
      if (_offCtx) {
        _offCtx.drawImage(imageElement, 0, 0, DETECT_WIDTH, DETECT_HEIGHT);
      }
      const input = _offCtx ? _offCanvas : imageElement;

      const preds = await _model.detect(input);

      // Scale factors to map bounding boxes back to original video size
      const scaleX = imageElement.videoWidth  ? imageElement.videoWidth  / DETECT_WIDTH  : 1;
      const scaleY = imageElement.videoHeight ? imageElement.videoHeight / DETECT_HEIGHT : 1;

      // Match phone-like objects with appropriate confidence per class
      const phones = preds.filter(p => {
        if (!PHONE_CLASSES.has(p.class)) return false;
        const minConf = p.class === 'cell phone' ? PHONE_CONFIDENCE : REMOTE_CONFIDENCE;
        return p.score > minConf;
      });

      if (phones.length > 0) {
        _lastDetected = Date.now();
        _lastResult = {
          detected: true,
          boxes: phones.map(p => ({
            x:      p.bbox[0] * scaleX,
            y:      p.bbox[1] * scaleY,
            width:  p.bbox[2] * scaleX,
            height: p.bbox[3] * scaleY,
            score:  p.score,
            label:  p.class,
          })),
          reason: `${phones.length} phone(s) ${(phones[0].score * 100).toFixed(0)}% [${phones[0].class}]`,
        };
      } else {
        // No detection — check sticky window
        const stale = Date.now() - _lastDetected > STICKY_MS;
        if (stale) {
          _lastResult = {
            detected: false,
            boxes: [],
            reason: `no phone (${preds.length} obj: ${preds.map(p => p.class).join(', ') || 'none'})`,
          };
        }
      }

      return _lastResult;
    } catch (e) {
      return { detected: false, boxes: [], reason: `err: ${e.message}` };
    }
  };

  return { detect, ready };
}
