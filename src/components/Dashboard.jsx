/**
 * Live class dashboard — shows all students from backend via Socket.io
 */
import { useSocket } from '../hooks/useSocket';

function attentionColor(score) {
  if (score >= 0.8) return '#00dc82';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}

function attentionLabel(score) {
  if (score >= 0.8) return 'Attentive';
  if (score >= 0.5) return 'Moderate';
  return 'Distracted';
}

function formatPosture(p) {
  return (p || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Dashboard() {
  const { students, connected } = useSocket();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Live Class Dashboard</h2>
        <div style={styles.connBadge}>
          <span style={{ ...styles.dot, background: connected ? '#00dc82' : '#f59e0b' }} />
          {connected ? 'Live' : 'Connecting...'}
        </div>
      </div>

      {/* Summary bar */}
      {students.length > 0 && (
        <div style={styles.summaryBar}>
          <SumStat label="Students" value={students.length} icon="👥" />
          <SumStat
            label="Avg Attention"
            value={`${Math.round(students.reduce((a, s) => a + s.attention_score, 0) / students.length * 100)}%`}
            icon="🧠"
          />
          <SumStat label="Phones" value={students.filter(s => s.phone_detected).length} icon="📱"
            warn={students.some(s => s.phone_detected)} />
          <SumStat label="Alerts" value={students.filter(s => s.fight_detected).length} icon="⚠️"
            warn={students.some(s => s.fight_detected)} />
        </div>
      )}

      {/* Student cards */}
      {students.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ fontSize: 40 }}>📭</p>
          <p>No students detected yet.</p>
          <p style={{ fontSize: 13, color: '#666' }}>Start the camera and make sure the backend is running.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {students.map(s => (
            <StudentCard key={s.student_id} student={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SumStat({ label, value, icon, warn }) {
  return (
    <div style={styles.sumStat}>
      <span>{icon}</span>
      <span style={{ fontWeight: 700, color: warn ? '#ef4444' : '#e0e0e0', fontSize: 18 }}>{value}</span>
      <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
    </div>
  );
}

function StudentCard({ student: s }) {
  const color = attentionColor(s.attention_score);
  const pct   = Math.round(s.attention_score * 100);

  return (
    <div style={{ ...styles.card, borderColor: color + '66' }}>
      {/* Avatar */}
      <div style={{ ...styles.avatar, background: color + '22', color }}>
        {s.student_id?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Name + status */}
      <div style={styles.cardName}>{s.student_id}</div>
      <div style={{ ...styles.badge, background: color + '22', color }}>{attentionLabel(s.attention_score)}</div>

      {/* Attention bar */}
      <div style={styles.barBg}>
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
      <div style={{ ...styles.pct, color }}>{pct}%</div>

      {/* Tags */}
      <div style={styles.tags}>
        <Tag icon="👁" label={s.gaze_score >= 1 ? 'Forward' : 'Away'}
          color={s.gaze_score >= 1 ? '#00dc82' : '#f59e0b'} />
        <Tag icon="🧍" label={formatPosture(s.posture)}
          color={s.posture === 'upright' ? '#00dc82' : s.posture === 'slouching' ? '#f59e0b' : '#ef4444'} />
        {s.phone_detected && <Tag icon="📱" label="Phone" color="#ef4444" />}
        {s.fight_detected && <Tag icon="⚠️" label="Fight" color="#ef4444" />}
      </div>
    </div>
  );
}

function Tag({ icon, label, color }) {
  return (
    <span style={{ ...styles.tag, color, borderColor: color + '55', background: color + '11' }}>
      {icon} {label}
    </span>
  );
}

const styles = {
  container:  { display: 'flex', flexDirection: 'column', gap: 16 },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:      { margin: 0, color: '#e0e0e0', fontSize: 20 },
  connBadge:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#aaa' },
  dot:        { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  summaryBar: { display: 'flex', gap: 24, background: '#1a1a2e', padding: '10px 20px', borderRadius: 10 },
  sumStat:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  empty:      { textAlign: 'center', color: '#666', padding: 40 },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 },
  card:       { background: '#1a1a2e', border: '1.5px solid', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  avatar:     { width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 },
  cardName:   { fontWeight: 700, color: '#e0e0e0', fontSize: 15, textAlign: 'center' },
  badge:      { fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 10 },
  barBg:      { width: '100%', height: 7, background: '#333', borderRadius: 4, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 4, transition: 'width 0.5s ease' },
  pct:        { fontSize: 13, fontWeight: 700 },
  tags:       { display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  tag:        { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, border: '1px solid' },
};
