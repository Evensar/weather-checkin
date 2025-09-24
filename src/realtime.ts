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

// Storage keys
const ROOMS_KEY = 'weather-checkin-rooms';
const SESSION_KEY = 'weather-checkin-session';

// In-memory store for current session
let rooms: Map<string, RoomState> = new Map();
let currentRoomId: string | null = null;
let currentUserName: string | null = null;
let stateHandlers: ((state: RoomState) => void)[] = [];
let pollInterval: NodeJS.Timeout | null = null;

// Debug logging
function debug(...args: any[]) {
  console.log('[Weather-Checkin]', ...args);
}

// Load rooms from localStorage
function loadRooms() {
  try {
    const stored = localStorage.getItem(ROOMS_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      rooms.clear();
      Object.entries(data).forEach(([key, value]) => {
        rooms.set(key, value as RoomState);
      });
      debug('Loaded rooms from localStorage:', rooms.size);
    }
  } catch (e) {
    console.warn('Failed to load rooms from localStorage:', e);
  }
}

// Save rooms to localStorage
function saveRooms() {
  try {
    const data: Record<string, RoomState> = {};
    rooms.forEach((value, key) => {
      data[key] = value;
    });
    localStorage.setItem(ROOMS_KEY, JSON.stringify(data));
    debug('Saved rooms to localStorage:', Object.keys(data).length);
  } catch (e) {
    console.warn('Failed to save rooms to localStorage:', e);
  }
}

// Load session
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

// Save session
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

// Notify all handlers of state change
function notifyState(roomId: string) {
  const state = rooms.get(roomId);
  if (state) {
    debug('Notifying state change:', roomId, state.participants.length);
    stateHandlers.forEach(handler => handler(state));
  }
}

// Start polling for changes
function startPolling() {
  if (pollInterval) return;
  
  debug('Starting polling for changes');
  pollInterval = setInterval(() => {
    if (currentRoomId) {
      const state = rooms.get(currentRoomId);
      if (state) {
        notifyState(currentRoomId);
      }
    }
  }, 1000); // Poll every second
}

// Stop polling
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    debug('Stopped polling');
  }
}

// Initialize on module load
loadRooms();
loadSession();

export class RealtimeClient {
  constructor() {
    debug('RealtimeClient initialized');
    startPolling();
    
    // Clean up old rooms (older than 24 hours)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    let cleanedCount = 0;
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.createdAt > dayMs) {
        rooms.delete(roomId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      debug(`Cleaned up ${cleanedCount} old rooms`);
    }
    saveRooms();
  }

  onState(handler: (state: RoomState) => void) {
    debug('Adding state handler');
    stateHandlers.push(handler);
    
    // If we have a current room, notify immediately
    if (currentRoomId) {
      const state = rooms.get(currentRoomId);
      if (state) {
        debug('Notifying initial state:', currentRoomId);
        handler(state);
      }
    }
  }

  createRoom(roomId?: string): Promise<string> {
    const id = roomId || Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    debug('Creating room:', id);
    
    const newRoom: RoomState = {
      roomId: id,
      createdAt: now,
      ended: false,
      anonymous: false,
      symbols: ['sun', 'partly', 'cloud', 'rain', 'storm'],
      participants: [],
      summary: { sun: 0, partly: 0, cloud: 0, rain: 0, storm: 0 }
    };
    
    rooms.set(id, newRoom);
    currentRoomId = id;
    saveRooms();
    saveSession();
    notifyState(id);
    
    return Promise.resolve(id);
  }

  joinRoom(roomId: string, name: string): Promise<boolean> {
    debug('Joining room:', roomId, 'as', name);
    
    const room = rooms.get(roomId);
    if (!room) {
      debug('Room not found:', roomId);
      return Promise.resolve(false);
    }
    
    // Check if user already exists
    const existingIndex = room.participants.findIndex(p => p.name === name);
    if (existingIndex >= 0) {
      debug('User already exists, updating:', name);
      room.participants[existingIndex] = { name, symbol: room.participants[existingIndex].symbol };
    } else {
      debug('Adding new participant:', name);
      room.participants.push({ name, symbol: null });
    }
    
    currentRoomId = roomId;
    currentUserName = name;
    saveRooms();
    saveSession();
    notifyState(roomId);
    
    return Promise.resolve(true);
  }

  getState(): Promise<RoomState | null> {
    if (!currentRoomId) {
      debug('No current room');
      return Promise.resolve(null);
    }
    
    const state = rooms.get(currentRoomId);
    debug('Getting state for room:', currentRoomId, state ? 'found' : 'not found');
    return Promise.resolve(state || null);
  }

  select(symbol: WeatherSymbolKey) {
    if (!currentRoomId || !currentUserName) {
      debug('Cannot select: no current room or user');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (!room) {
      debug('Room not found:', currentRoomId);
      return;
    }
    
    if (room.ended) {
      debug('Cannot select: room is ended');
      return;
    }
    
    // Find current user
    const participantIndex = room.participants.findIndex(p => p.name === currentUserName);
    if (participantIndex >= 0) {
      debug('Setting symbol for', currentUserName, 'to', symbol);
      room.participants[participantIndex].symbol = symbol;
      this.updateSummary(room);
      saveRooms();
      notifyState(currentRoomId);
    } else {
      // User not found, add them
      debug('User not found in room, adding:', currentUserName);
      room.participants.push({ name: currentUserName, symbol });
      this.updateSummary(room);
      saveRooms();
      notifyState(currentRoomId);
    }
  }

  endRound() {
    if (!currentRoomId) {
      debug('Cannot end round: no current room');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (room) {
      debug('Ending round for room:', currentRoomId);
      room.ended = true;
      saveRooms();
      notifyState(currentRoomId);
    } else {
      debug('Room not found:', currentRoomId);
    }
  }

  setAnonymous(anonymous: boolean) {
    if (!currentRoomId) {
      debug('Cannot set anonymous: no current room');
      return;
    }
    
    const room = rooms.get(currentRoomId);
    if (room) {
      debug('Setting anonymous mode to', anonymous, 'for room:', currentRoomId);
      room.anonymous = anonymous;
      saveRooms();
      notifyState(currentRoomId);
    } else {
      debug('Room not found:', currentRoomId);
    }
  }

  private updateSummary(room: RoomState) {
    debug('Updating summary for room:', room.roomId);
    const summary: Record<string, number> = { sun: 0, partly: 0, cloud: 0, rain: 0, storm: 0 };
    room.participants.forEach(p => {
      if (p.symbol) {
        summary[p.symbol] = (summary[p.symbol] || 0) + 1;
      }
    });
    room.summary = summary;
  }

  // Cleanup method
  destroy() {
    stopPolling();
    stateHandlers = [];
  }
}