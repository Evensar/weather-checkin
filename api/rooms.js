// In-memory store (will be reset on each cold start)
let rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      participants: new Map(),
      symbols: ['sun', 'partly', 'cloud', 'rain', 'storm'],
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

function roomState(roomId) {
  const room = getRoom(roomId);
  const participants = Array.from(room.participants.values()).map((p) => ({ 
    name: p.name, 
    symbol: p.symbol 
  }));
  return {
    roomId,
    createdAt: room.createdAt,
    ended: room.ended,
    anonymous: room.anonymous,
    symbols: room.symbols,
    participants,
    summary: summarize(room),
  };
}

export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method } = req;
  const { roomId, name, symbol, anonymous } = req.body || {};

  try {
    switch (method) {
      case 'POST':
        if (req.query.action === 'create') {
          const id = roomId || Math.random().toString(36).slice(2, 8);
          getRoom(id);
          res.status(200).json({ roomId: id });
          return;
        }

        if (req.query.action === 'join') {
          const room = getRoom(roomId);
          const participantId = Math.random().toString(36).slice(2, 8);
          room.participants.set(participantId, { 
            name: String(name || 'Gäst').slice(0, 40), 
            symbol: null 
          });
          res.status(200).json({ 
            ok: true, 
            participantId,
            state: roomState(roomId) 
          });
          return;
        }

        if (req.query.action === 'select') {
          const room = getRoom(roomId);
          if (room.ended) {
            res.status(400).json({ error: 'Room is ended' });
            return;
          }
          
          // Find participant by name (simplified)
          for (const [id, p] of room.participants) {
            if (p.name === name) {
              p.symbol = symbol;
              break;
            }
          }
          
          res.status(200).json({ 
            ok: true, 
            state: roomState(roomId) 
          });
          return;
        }

        if (req.query.action === 'end') {
          const room = getRoom(roomId);
          room.ended = true;
          res.status(200).json({ 
            ok: true, 
            state: roomState(roomId) 
          });
          return;
        }

        if (req.query.action === 'toggle_anonymous') {
          const room = getRoom(roomId);
          room.anonymous = Boolean(anonymous);
          res.status(200).json({ 
            ok: true, 
            state: roomState(roomId) 
          });
          return;
        }

        res.status(400).json({ error: 'Invalid action' });
        break;

      case 'GET':
        if (req.query.roomId) {
          const state = roomState(req.query.roomId);
          res.status(200).json(state);
          return;
        }
        res.status(400).json({ error: 'Room ID required' });
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
