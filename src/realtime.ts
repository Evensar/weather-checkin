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

// Local storage key for rooms
const STORAGE_KEY = 'weather-checkin-rooms';

// In-memory store for current session
let rooms: Map<string, RoomState> = new Map();
let currentRoomId: string | null = null;
let currentUserName: string | null = null;
let stateHandlers: ((state: RoomState) => void)[] = [];

// Load rooms from localStorage on init
function loadRooms() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      rooms = new Map(Object.entries(data));
    }
  } catch (e) {
    console.warn('Failed to load rooms from localStorage:', e);
  }
}

// Save rooms to localStorage
function saveRooms() {
  try {
    const data = Object.fromEntries(rooms);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save rooms to localStorage:', e);
  }
}

// Notify all handlers of state change
function notifyState(roomId: string) {
  const state = rooms.get(roomId);
  if (state) {
    stateHandlers.forEach(handler => handler(state));
  }
}

// Initialize on module load
loadRooms();

export class RealtimeClient {
  constructor() {
    // Clean up old rooms (older than 24 hours)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.createdAt > dayMs) {
        rooms.delete(roomId);
      }
    }
    saveRooms();
  }

  onState(handler: (state: RoomState) => void) {
    stateHandlers.push(handler);
    
    // If we have a current room, notify immediately
    if (currentRoomId) {
      const state = rooms.get(currentRoomId);
      if (state) handler(state);
    }
  }

  createRoom(roomId?: string): Promise<string> {
    const id = roomId || Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    
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
    notifyState(id);
    
    return Promise.resolve(id);
  }

  joinRoom(roomId: string, name: string): Promise<boolean> {
    const room = rooms.get(roomId);
    if (!room) return Promise.resolve(false);
    
    // Check if user already exists
    const existingIndex = room.participants.findIndex(p => p.name === name);
    if (existingIndex >= 0) {
      // Update existing participant
      room.participants[existingIndex] = { name, symbol: room.participants[existingIndex].symbol };
    } else {
      // Add new participant
      room.participants.push({ name, symbol: null });
    }
    
    currentRoomId = roomId;
    currentUserName = name;
    saveRooms();
    notifyState(roomId);
    
    return Promise.resolve(true);
  }

  getState(): Promise<RoomState | null> {
    if (!currentRoomId) return Promise.resolve(null);
    const state = rooms.get(currentRoomId);
    return Promise.resolve(state || null);
  }

  select(symbol: WeatherSymbolKey) {
    if (!currentRoomId || !currentUserName) return;
    
    const room = rooms.get(currentRoomId);
    if (!room || room.ended) return;
    
    // Find current user
    const participantIndex = room.participants.findIndex(p => p.name === currentUserName);
    if (participantIndex >= 0) {
      room.participants[participantIndex].symbol = symbol;
      this.updateSummary(room);
      saveRooms();
      notifyState(currentRoomId);
    }
  }

  endRound() {
    if (!currentRoomId) return;
    
    const room = rooms.get(currentRoomId);
    if (room) {
      room.ended = true;
      saveRooms();
      notifyState(currentRoomId);
    }
  }

  setAnonymous(anonymous: boolean) {
    if (!currentRoomId) return;
    
    const room = rooms.get(currentRoomId);
    if (room) {
      room.anonymous = anonymous;
      saveRooms();
      notifyState(currentRoomId);
    }
  }

  private updateSummary(room: RoomState) {
    const summary: Record<string, number> = { sun: 0, partly: 0, cloud: 0, rain: 0, storm: 0 };
    room.participants.forEach(p => {
      if (p.symbol) {
        summary[p.symbol] = (summary[p.symbol] || 0) + 1;
      }
    });
    room.summary = summary;
  }
}


