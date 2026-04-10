/**
 * Diagnostic component — tests each model independently.
 * Open this to see exactly what's working and what's not.
 */
import { useRef, useState, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { getMediaPipe } from '../hooks/useMediaPipe';

export default function DiagnosticView() {
  const videoRef = useRef(null);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  const addLog = (msg, color = '#e0e0e0') => {
    setLog(prev => [...prev.slice(-30), { msg, color, t: new Date().toLocaleTimeString() }]);
  };

  const startTest = async () => {
    setLog([]);
    setRunning(true);

    // 1. Camera
    addLog('📷 Opening camera...', '#f59e0b');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      addLog(`✅ Camera OK — ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`, '#00dc82');
    } catch (e) {
      addLog(`❌ Camera FAILED: ${e.message}`, '#ef4444');
      setRunning(false);
      return;
    }

    // 2. face-api.js models
    addLog('🧠 Loading face-api.js models...', '#f59e0b');
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);
      addLog('✅ face-api.js models loaded', '#00dc82');
    } catch (e) {
      addLog(`❌ face-api.js FAILED: ${e.message}`, '#ef4444');
    }

    // 3 & 4. MediaPipe FaceMesh + Pose (sequential singleton)
    addLog('👁 Loading MediaPipe FaceMesh + Pose...', '#f59e0b');
    let faceMesh = null, pose = null;
    try {
      const mp = await getMediaPipe();
      faceMesh = mp.faceMesh;
      pose     = mp.pose;

      let fmGot = false, poseGot = false;
      faceMesh.onResults(r => {
        if (!fmGot) { fmGot = true; addLog(`✅ FaceMesh working — faces: ${(r.multiFaceLandmarks||[]).length}`, '#00dc82'); }
      });
      pose.onResults(r => {
        if (!poseGot) { poseGot = true; addLog(`✅ Pose working — landmarks: ${r.poseLandmarks ? r.poseLandmarks.length : 0}`, '#00dc82'); }
      });
      addLog('✅ MediaPipe initialized', '#00dc82');
    } catch (e) {
      addLog(`❌ MediaPipe FAILED: ${e.message}`, '#ef4444');
    }

    // 5. Continuous test loop
    addLog('🔄 Running continuous detection test...', '#36a2eb');
    let frameCount = 0;
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      frameCount++;

      // face-api detection
      try {
        const dets = await faceapi.detectAllFaces(videoRef.current,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }));
        if (frameCount % 5 === 0) {
          addLog(`[frame ${frameCount}] face-api: ${dets.length} face(s)`,
            dets.length > 0 ? '#00dc82' : '#888');
        }
      } catch (e) {
        addLog(`[frame ${frameCount}] face-api error: ${e.message}`, '#ef4444');
      }

      // MediaPipe
      if (faceMesh) faceMesh.send({ image: videoRef.current }).catch(() => {});
      if (pose)     pose.send({ image: videoRef.current }).catch(() => {});
    }, 500);
  };

  const stopTest = () => {
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRunning(false);
    addLog('⏹ Stopped', '#888');
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ color: '#e0e0e0' }}>🔬 Detection Diagnostic</h2>
      <p style={{ color: '#888', fontSize: 13 }}>Tests each model independently to find what's failing.</p>

      <video ref={videoRef} autoPlay muted playsInline
        style={{ width: 320, height: 240, background: '#000', borderRadius: 8, display: 'block', marginBottom: 12 }} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button onClick={startTest} disabled={running}
          style={{ padding: '8px 20px', background: '#00dc82', color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
          ▶ Run Diagnostic
        </button>
        <button onClick={stopTest} disabled={!running}
          style={{ padding: '8px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
          ■ Stop
        </button>
      </div>

      <div style={{ background: '#0d0d1a', border: '1px solid #222', borderRadius: 8, padding: 12, height: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
        {log.length === 0 && <p style={{ color: '#444' }}>Click "Run Diagnostic" to start...</p>}
        {log.map((l, i) => (
          <div key={i} style={{ color: l.color, marginBottom: 3 }}>
            <span style={{ color: '#555' }}>[{l.t}] </span>{l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
