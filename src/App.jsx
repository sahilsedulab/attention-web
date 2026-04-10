import { useState } from 'react';
import CameraView      from './components/CameraView';
import Dashboard       from './components/Dashboard';
import EnrollmentPanel from './components/EnrollmentPanel';
import DiagnosticView  from './components/DiagnosticView';
import { BACKEND_URL } from './config';
import './App.css';

const TABS = ['Monitor', 'Dashboard', 'Enrollments', 'Diagnostic'];

export default function App() {
  const [tab, setTab]             = useState('Monitor');
  const [studentName, setStudentName] = useState('');
  const [lastResult, setLastResult]   = useState(null);

  return (
    <div className="app">
      {/* Top nav */}
      <header className="navbar">
        <div className="brand">
          <span className="brand-icon">🎓</span>
          <span className="brand-name">Attention AI</span>
        </div>
        <nav className="tabs">
          {TABS.map(t => (
            <button
              key={t}
              className={`tab-btn ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="backend-url">
          🔗 {BACKEND_URL.replace('https://', '').replace('http://', '')}
        </div>
      </header>

      <main className="main">
        {tab === 'Monitor' && (
          <div className="monitor-layout">
            <div className="monitor-left">
              <div className="card">
                <h2 className="card-title">📷 Camera Monitor</h2>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
                  Faces are identified automatically from enrolled students.
                  Enroll students first in the <strong style={{ color: '#00dc82' }}>Enrollments</strong> tab.
                </p>
                <CameraView
                  studentName={studentName || 'Student'}
                  onResult={setLastResult}
                />
              </div>
            </div>

            <div className="monitor-right">
              {lastResult && (
                <div className="card">
                  <h2 className="card-title">📊 Live Analysis</h2>
                  <ResultDetail result={lastResult} />
                </div>
              )}
              <div className="card">
                <h2 className="card-title">ℹ️ How it works</h2>
                <ul className="how-list">
                  <li>📷 Browser captures webcam frames</li>
                  <li>🧠 MediaPipe detects face + pose in real-time</li>
                  <li>👁 Gaze estimated from face landmarks</li>
                  <li>🧍 Posture from shoulder/nose keypoints</li>
                  <li>📱 Phone detected via COCO-SSD object detection</li>
                  <li>⚠️ Fight: 2+ faces close + raised arm + rapid movement</li>
                  <li>📡 Data sent to backend every 3 seconds</li>
                  <li>📱 Flutter app shows live dashboard</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === 'Dashboard' && (
          <div className="card">
            <Dashboard />
          </div>
        )}

        {tab === 'Enrollments' && (
          <div className="card" style={{ maxWidth: 600 }}>
            <EnrollmentPanel />
          </div>
        )}

        {tab === 'Diagnostic' && <DiagnosticView />}
      </main>
    </div>
  );
}

function ResultDetail({ result: r }) {
  const pct   = Math.round(r.attention_score * 100);
  const color = pct >= 80 ? '#00dc82' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="result-detail">
      <div className="result-row">
        <span className="result-label">Student</span>
        <span className="result-value">{r.student_id}</span>
      </div>
      <div className="result-row">
        <span className="result-label">Attention</span>
        <div className="result-bar-wrap">
          <div className="result-bar-bg">
            <div className="result-bar-fill" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span style={{ color, fontWeight: 700 }}>{pct}%</span>
        </div>
      </div>
      <div className="result-row">
        <span className="result-label">Gaze</span>
        <span className="result-value" style={{ color: r.gaze_score >= 1 ? '#00dc82' : '#f59e0b' }}>
          {r.gaze_score >= 1 ? '✅ Looking forward' : '❌ Looking away'}
        </span>
      </div>
      <div className="result-row">
        <span className="result-label">Posture</span>
        <span className="result-value" style={{ color: r.posture === 'upright' ? '#00dc82' : '#f59e0b' }}>
          {r.posture?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="result-row">
        <span className="result-label">Phone</span>
        <span className="result-value" style={{ color: r.phone_detected ? '#ef4444' : '#00dc82' }}>
          {r.phone_detected ? '📱 Detected' : '✅ None'}
        </span>
      </div>
      <div className="result-row">
        <span className="result-label">Fight</span>
        <span className="result-value" style={{ color: r.fight_detected ? '#ef4444' : '#00dc82' }}>
          {r.fight_detected ? '⚠️ Alert!' : '✅ None'}
        </span>
      </div>
    </div>
  );
}
