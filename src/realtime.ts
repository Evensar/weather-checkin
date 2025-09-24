import { io, Socket } from 'socket.io-client';
import type { WeatherSymbolKey } from './symbols';

export type Participant = { name: string; symbol: WeatherSymbolKey | null };
export type RoomState = {
  roomId: string;
  createdAt: number;
  ended: boolean;
  anonymous: boolean;
  symbols: WeatherSymbolKey[];
  participants: Participant[];
  summary: Record<string, number>;
};

// Session storage key
const SESSION_KEY = 'weather-checkin-session';

// Socket.IO connection
let socket: Socket | null = null;
let currentRoomId: string | null = null;
let currentUserName: string | null = null;
let stateHandlers: ((state: RoomState) => void)[] = [];

// Debug logging
function debug(...args: any[]) {
  console.log('[Weather-Checkin]', ...args);
}

// Initialize Socket.IO connection
function initSocket() {
  if (socket) return socket;
  
  debug('Initializing Socket.IO connection');
  
  // Use Vercel server in production, localhost in development
  const serverUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : 'https://weather-checkin-2zqbb6ub9zgv8czlzqthv2tex33q3.vercel.app';
  
  socket = io(serverUrl, {
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    debug('Socket.IO connected');
  });

  socket.on('disconnect', () => {
    debug('Socket.IO disconnected');
  });

  socket.on('state', (state: RoomState) => {
    debug('Received state update:', state.roomId, state.participants.length);
    stateHandlers.forEach(handler => handler(state));
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
  });

  return socket;
}

// Load session (current user and room)
function loadSession() {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      const { roomId, userName } = JSON.parse(session);
      currentRoomId = roomId || null;
      currentUserName = userName || null;
      debug('Loaded session:', { roomId, userName });
    }
  } catch (e) {
    console.warn('Failed to load session from localStorage:', e);
  }
}

// Save session (current user and room)
function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      roomId: currentRoomId,
      userName: currentUserName
    }));
    debug('Saved session:', { roomId: currentRoomId, userName: currentUserName });
  } catch (e) {
    console.warn('Failed to save session from localStorage:', e);
  }
}

// Initialize on module load
loadSession();

export class RealtimeClient {
  constructor() {
    debug('RealtimeClient initialized');
    initSocket();
  }

  onState(handler: (state: RoomState) => void) {
    debug('Adding state handler');
    stateHandlers.push(handler);
    
    // If we have a current room, request current state
    if (currentRoomId && socket) {
      socket.emit('get_state', (state: RoomState | null) => {
        if (state) {
          debug('Received initial state:', currentRoomId);
          handler(state);
        }
      });
    }
  }

  createRoom(roomId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      const id = roomId || Math.random().toString(36).slice(2, 8);
      debug('Creating room:', id);
      
      socket.emit('create_room', { roomId: id }, (response: { roomId: string }) => {
        if (response && response.roomId) {
          currentRoomId = response.roomId;
          saveSession();
          debug('Room created:', response.roomId);
          resolve(response.roomId);
        } else {
          reject(new Error('Failed to create room'));
        }
      });
    });
  }

  joinRoom(roomId: string, name: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      debug('Joining room:', roomId, 'as', name);
      
      socket.emit('join_room', { roomId, name }, (response: { ok: boolean }) => {
        if (response && response.ok) {
          currentRoomId = roomId;
          currentUserName = name;
          saveSession();
          debug('Successfully joined room:', roomId);
          resolve(true);
        } else {
          debug('Failed to join room:', roomId);
          resolve(false);
        }
      });
    });
  }

  getState(): Promise<RoomState | null> {
    return new Promise((resolve) => {
      if (!socket || !currentRoomId) {
        debug('No current room or socket');
        resolve(null);
        return;
      }
      
      socket.emit('get_state', (state: RoomState | null) => {
        debug('Getting state for room:', currentRoomId, state ? 'found' : 'not found');
        resolve(state);
      });
    });
  }

  select(symbol: WeatherSymbolKey) {
    if (!socket || !currentRoomId) {
      debug('Cannot select: no socket or current room');
      return;
    }
    
    debug('Selecting symbol:', symbol);
    socket.emit('select', { symbol });
  }

  endRound() {
    if (!socket || !currentRoomId) {
      debug('Cannot end round: no socket or current room');
      return;
    }
    
    debug('Ending round for room:', currentRoomId);
    socket.emit('end_round');
  }

  setAnonymous(anonymous: boolean) {
    if (!socket || !currentRoomId) {
      debug('Cannot set anonymous: no socket or current room');
      return;
    }
    
    debug('Setting anonymous mode to', anonymous, 'for room:', currentRoomId);
    socket.emit('toggle_anonymous', { anonymous });
  }
}