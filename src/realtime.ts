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

// API configuration
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : 'https://weather-checkin-2zqbb6ub9zgv8czlzqthv2tex33q3.vercel.app/api';

// State management
let currentRoomId: string | null = null;
let currentUserName: string | null = null;
let stateHandlers: ((state: RoomState) => void)[] = [];
let pollInterval: number | null = null;

// Debug logging
function debug(...args: any[]) {
  console.log('[Weather-Checkin]', ...args);
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

// API calls
async function apiCall(endpoint: string, method: string = 'GET', body?: any) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
}

// Start polling for changes
function startPolling() {
  if (pollInterval) return;
  
  debug('Starting polling for changes');
  pollInterval = window.setInterval(async () => {
    if (currentRoomId) {
      try {
        const state = await apiCall(`/rooms?roomId=${currentRoomId}`);
        stateHandlers.forEach(handler => handler(state));
      } catch (error) {
        console.warn('Polling error:', error);
      }
    }
  }, 2000); // Poll every 2 seconds
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
loadSession();

export class RealtimeClient {
  constructor() {
    debug('RealtimeClient initialized');
    startPolling();
  }

  onState(handler: (state: RoomState) => void) {
    debug('Adding state handler');
    stateHandlers.push(handler);
    
    // If we have a current room, get initial state
    if (currentRoomId) {
      this.getState().then(state => {
        if (state) {
          debug('Notifying initial state:', currentRoomId);
          handler(state);
        }
      });
    }
  }

  async createRoom(roomId?: string): Promise<string> {
    const id = roomId || Math.random().toString(36).slice(2, 8);
    debug('Creating room:', id);
    
    try {
      await apiCall(`/rooms?action=create`, 'POST', { roomId: id });
      currentRoomId = id;
      saveSession();
      debug('Room created:', id);
      return id;
    } catch (error) {
      console.error('Failed to create room:', error);
      throw error;
    }
  }

  async joinRoom(roomId: string, name: string): Promise<boolean> {
    debug('Joining room:', roomId, 'as', name);
    
    try {
      const result = await apiCall(`/rooms?action=join`, 'POST', { roomId, name });
      if (result.ok) {
        currentRoomId = roomId;
        currentUserName = name;
        saveSession();
        debug('Successfully joined room:', roomId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to join room:', error);
      return false;
    }
  }

  async getState(): Promise<RoomState | null> {
    if (!currentRoomId) {
      debug('No current room');
      return null;
    }
    
    try {
      const state = await apiCall(`/rooms?roomId=${currentRoomId}`);
      debug('Getting state for room:', currentRoomId, state ? 'found' : 'not found');
      return state;
    } catch (error) {
      console.error('Failed to get state:', error);
      return null;
    }
  }

  async select(symbol: WeatherSymbolKey) {
    if (!currentRoomId || !currentUserName) {
      debug('Cannot select: no current room or user');
      return;
    }
    
    try {
      await apiCall(`/rooms?action=select`, 'POST', { 
        roomId: currentRoomId, 
        name: currentUserName, 
        symbol 
      });
      debug('Selected symbol:', symbol);
    } catch (error) {
      console.error('Failed to select symbol:', error);
    }
  }

  async endRound() {
    if (!currentRoomId) {
      debug('Cannot end round: no current room');
      return;
    }
    
    try {
      await apiCall(`/rooms?action=end`, 'POST', { roomId: currentRoomId });
      debug('Ended round for room:', currentRoomId);
    } catch (error) {
      console.error('Failed to end round:', error);
    }
  }

  async setAnonymous(anonymous: boolean) {
    if (!currentRoomId) {
      debug('Cannot set anonymous: no current room');
      return;
    }
    
    try {
      await apiCall(`/rooms?action=toggle_anonymous`, 'POST', { 
        roomId: currentRoomId, 
        anonymous 
      });
      debug('Set anonymous mode to', anonymous, 'for room:', currentRoomId);
    } catch (error) {
      console.error('Failed to set anonymous mode:', error);
    }
  }

  // Cleanup method
  destroy() {
    stopPolling();
    stateHandlers = [];
  }
}