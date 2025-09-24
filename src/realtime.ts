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

export class RealtimeClient {
  private socket: Socket;

  constructor() {
    this.socket = io('/', { transports: ['websocket'] });
  }

  onState(handler: (state: RoomState) => void) {
    this.socket.on('state', handler);
  }

  createRoom(roomId?: string): Promise<string> {
    return new Promise((resolve) => {
      this.socket.emit('create_room', { roomId }, (res: { roomId: string }) => resolve(res.roomId));
    });
  }

  joinRoom(roomId: string, name: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.socket.emit('join_room', { roomId, name }, (res: { ok: boolean }) => resolve(res?.ok ?? false));
    });
  }

  getState(): Promise<RoomState | null> {
    return new Promise((resolve) => {
      this.socket.emit('get_state', (state: RoomState | null) => resolve(state));
    });
  }

  select(symbol: WeatherSymbolKey) {
    this.socket.emit('select', { symbol });
  }

  endRound() {
    this.socket.emit('end_round');
  }

  setAnonymous(anonymous: boolean) {
    this.socket.emit('toggle_anonymous', { anonymous });
  }
}


