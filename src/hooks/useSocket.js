import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';

export function useSocket() {
  const socketRef = useRef(null);
  const [students, setStudents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('initial_state', (data) => {
      if (Array.isArray(data)) setStudents(data);
    });

    socket.on('attention_update', (record) => {
      setStudents(prev => {
        const idx = prev.findIndex(s => s.student_id === record.student_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = record;
          return next;
        }
        return [...prev, record];
      });
    });

    socket.on('student_removed', ({ student_id }) => {
      setStudents(prev => prev.filter(s => s.student_id !== student_id));
    });

    socket.on('all_cleared', () => setStudents([]));

    return () => socket.disconnect();
  }, []);

  return { students, connected };
}
