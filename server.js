import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

// In-memory store (ephemeral)
const rooms = new Map(); // roomId -> { participants: Map<socketId,{name, symbol|null}>, symbols:Set, ended:boolean, createdAt:number, anonymous:boolean }

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      participants: new Map(),
      symbols: new Set(['sun','partly','cloud','rain','storm']),
      ended: false,
      createdAt: Date.now(),
      anonymous: false,
    });
  }
  return rooms.get(roomId);
}

function summarize(room) {
  const counts = {};
  for (const sym of room.symbols) counts[sym] = 0;
  for (const [, p] of room.participants) {
    if (p.symbol) counts[p.symbol] = (counts[p.symbol] || 0) + 1;
  }
  return counts;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

io.on('connection', (socket) => {
  let joinedRoomId = null;

  socket.on('create_room', ({ roomId }, callback) => {
    const rid = roomId || Math.random().toString(36).slice(2, 8);
    getRoom(rid);
    callback?.({ roomId: rid });
  });

  socket.on('join_room', ({ roomId, name }, callback) => {
    const room = getRoom(roomId);
    joinedRoomId = roomId;
    socket.join(roomId);
    room.participants.set(socket.id, { name: String(name || 'Gäst').slice(0, 40), symbol: null });
    io.to(roomId).emit('state', roomState(roomId));
    callback?.({ ok: true });
  });

  socket.on('select', ({ symbol }) => {
    if (!joinedRoomId) return;
    const room = getRoom(joinedRoomId);
    if (room.ended) return;
    if (!room.symbols.has(symbol)) return;
    const p = room.participants.get(socket.id);
    if (!p) return;
    p.symbol = symbol;
    io.to(joinedRoomId).emit('state', roomState(joinedRoomId));
  });

  socket.on('end_round', () => {
    if (!joinedRoomId) return;
    const room = getRoom(joinedRoomId);
    room.ended = true;
    io.to(joinedRoomId).emit('state', roomState(joinedRoomId));
  });

  socket.on('toggle_anonymous', ({ anonymous }) => {
    if (!joinedRoomId) return;
    const room = getRoom(joinedRoomId);
    room.anonymous = Boolean(anonymous);
    io.to(joinedRoomId).emit('state', roomState(joinedRoomId));
  });

  socket.on('get_state', (callback) => {
    if (!joinedRoomId) return callback?.(null);
    callback?.(roomState(joinedRoomId));
  });

  socket.on('disconnect', () => {
    if (!joinedRoomId) return;
    const room = getRoom(joinedRoomId);
    room.participants.delete(socket.id);
    io.to(joinedRoomId).emit('state', roomState(joinedRoomId));
  });
});

function roomState(roomId) {
  const room = getRoom(roomId);
  const participants = Array.from(room.participants.values()).map((p) => ({ name: p.name, symbol: p.symbol }));
  return {
    roomId,
    createdAt: room.createdAt,
    ended: room.ended,
    anonymous: room.anonymous,
    symbols: Array.from(room.symbols),
    participants,
    summary: summarize(room),
  };
}

const PORT = process.env.PORT || 3001;

// For Vercel, we need to export the server
if (process.env.NODE_ENV === 'production') {
  // Vercel will handle the server
  module.exports = app;
} else {
  // Local development
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Realtime server listening on :${PORT}`);
  });
}



