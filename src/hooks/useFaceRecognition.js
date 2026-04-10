/**
 * Face recognition using face-api.js (runs entirely in browser).
 *
 * Enrollment:
 *   - Capture 15 frames from webcam
 *   - Detect face in each frame
 *   - Average the 128-dim face descriptors
 *   - Store {name, descriptor} in localStorage
 *
 * Recognition:
 *   - For each detected face, compute descriptor
 *   - Find closest enrolled face using Euclidean distance
 *   - If distance < MATCH_THRESHOLD → identified, else → UNKNOWN
 *
 * Models loaded from /public/models/ (run scripts/download-models.js first)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { BACKEND_URL } from '../config';

const MATCH_THRESHOLD = 0.90; // 0.70 is highly lenient to account for heavy 128D distortion on side profiles
const STORAGE_KEY = 'attention_enrollments';
const MODELS_URL = '/models';   // local — run scripts/download-models.js first

export function useFaceRecognition() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [enrollments, setEnrollments] = useState([]);   // [{name, descriptor: Float32Array}]
  const matcherRef = useRef(null);

  // ── Load models ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Ensure TF.js backend is ready before loading face-api models
    import('@tensorflow/tfjs').then(tf => tf.ready()).then(() =>
      Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
      ])
    )
      .then(() => {
        setModelsLoaded(true);
        _loadFromStorage();
        console.log('[face-api] all models loaded');
      })
      .catch(e => console.error('face-api model load failed:', e));
  }, []);

  // ── Persist to / load from localStorage ─────────────────────────────────────
  const _loadFromStorage = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Handle both old schema (single descriptor) and new schema (multiple array)
      const loaded = parsed.map(e => ({
        name: e.name,
        descriptors: e.descriptors
          ? e.descriptors.map(d => new Float32Array(d))
          : [new Float32Array(e.descriptor)], // backwards compatibility
      }));
      setEnrollments(loaded);
      _rebuildMatcher(loaded);

      // Sync existing enrollments to backend (so Flutter app can see them)
      for (const e of loaded) {
        fetch(`${BACKEND_URL}/enrollments/${encodeURIComponent(e.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'web' }),
        }).catch(() => { });
      }
    } catch (e) {
      console.warn('Could not load enrollments from storage:', e);
    }
  };

  const _saveToStorage = (list) => {
    try {
      const serializable = list.map(e => ({
        name: e.name,
        descriptors: e.descriptors.map(d => Array.from(d)),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.warn('Could not save enrollments:', e);
    }
  };

  const _rebuildMatcher = (list) => {
    if (list.length === 0) { matcherRef.current = null; return; }
    const labeled = list.map(e =>
      new faceapi.LabeledFaceDescriptors(e.name, e.descriptors)
    );
    matcherRef.current = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD);
  };

  // ── Enroll a student from an array of HTMLVideoElement frames ───────────────
  const enroll = useCallback(async (name, videoElement, onProgress) => {
    if (!modelsLoaded) throw new Error('Models not loaded yet');
    if (!name?.trim()) throw new Error('Name is required');

    const descriptors = [];
    const FRAMES = 15;
    // SsdMobilenetv1 handles side/angled faces better than TinyFaceDetector
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

    for (let i = 0; i < FRAMES; i++) {
      onProgress?.(`Capturing frame ${i + 1}/${FRAMES}... Turn head slowly!`);
      try {
        const detection = await faceapi
          .detectSingleFace(videoElement, opts)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) descriptors.push(detection.descriptor);
      } catch (_) { }
      await new Promise(r => setTimeout(r, 200));
    }

    if (descriptors.length === 0) {
      throw new Error('No face detected. Ensure good lighting and face is visible.');
    }

    // We no longer average descriptors! Averaging destroys side-profile data.
    // By keeping all 15 distinct descriptors (front, left, right), the 
    // FaceMatcher can match the person from ANY angle.
    const updated = [
      ...enrollments.filter(e => e.name !== name.trim()),
      { name: name.trim(), descriptors },
    ];
    setEnrollments(updated);
    _saveToStorage(updated);
    _rebuildMatcher(updated);

    // Sync with backend so Flutter app can see this enrollment
    try {
      await fetch(`${BACKEND_URL}/enrollments/${encodeURIComponent(name.trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'web' }),
      });
    } catch (e) {
      console.warn('[enrollment] Backend sync failed:', e.message);
    }

    return descriptors.length;
  }, [modelsLoaded, enrollments]);

  // ── Delete an enrollment ─────────────────────────────────────────────────────
  const deleteEnrollment = useCallback((name) => {
    const updated = enrollments.filter(e => e.name !== name);
    setEnrollments(updated);
    _saveToStorage(updated);
    _rebuildMatcher(updated);

    // Sync deletion with backend
    fetch(`${BACKEND_URL}/enrollments/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).catch(e => console.warn('[enrollment] Backend delete sync failed:', e.message));
  }, [enrollments]);

  // ── Identify a face from a descriptor ────────────────────────────────────────
  const identify = useCallback((descriptor) => {
    if (!matcherRef.current || !descriptor) return 'UNKNOWN';
    const match = matcherRef.current.findBestMatch(descriptor);
    return match.label === 'unknown' ? 'UNKNOWN' : match.label;
  }, []);

  // ── Detect + identify all faces in a video frame ─────────────────────────────
  const detectAndIdentify = useCallback(async (videoElement) => {
    if (!modelsLoaded || !videoElement) return [];
    try {
      // SsdMobilenetv1: detects frontal + side + angled faces
      // minConfidence 0.3 = more detections, fewer misses
      const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
      const detections = await faceapi
        .detectAllFaces(videoElement, opts)
        .withFaceLandmarks()
        .withFaceDescriptors();

      return detections.map(d => ({
        bbox: d.detection.box,
        descriptor: d.descriptor,
        name: identify(d.descriptor),
        confidence: matcherRef.current
          ? Math.max(0, 1 - matcherRef.current.findBestMatch(d.descriptor).distance)
          : 0,
      }));
    } catch (_) {
      return [];
    }
  }, [modelsLoaded, identify]);

  return {
    modelsLoaded,
    enrollments,
    enroll,
    deleteEnrollment,
    detectAndIdentify,
    identify,
  };
}
