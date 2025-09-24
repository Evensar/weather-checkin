const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory store (will be reset on restart)
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

// API routes
app.post('/api/rooms', (req, res) => {
  const { action, roomId, name, symbol, anonymous } = req.body;

  try {
    switch (action) {
      case 'create':
        const id = roomId || Math.random().toString(36).slice(2, 8);
        getRoom(id);
        res.json({ roomId: id });
        break;

      case 'join':
        const room = getRoom(roomId);
        const participantId = Math.random().toString(36).slice(2, 8);
        room.participants.set(participantId, { 
          name: String(name || 'Gäst').slice(0, 40), 
          symbol: null 
        });
        res.json({ 
          ok: true, 
          participantId,
          state: roomState(roomId) 
        });
        break;

      case 'select':
        const selectRoom = getRoom(roomId);
        if (selectRoom.ended) {
          res.status(400).json({ error: 'Room is ended' });
          return;
        }
        
        // Find participant by name
        for (const [id, p] of selectRoom.participants) {
          if (p.name === name) {
            p.symbol = symbol;
            break;
          }
        }
        
        res.json({ 
          ok: true, 
          state: roomState(roomId) 
        });
        break;

      case 'end':
        const endRoom = getRoom(roomId);
        endRoom.ended = true;
        res.json({ 
          ok: true, 
          state: roomState(roomId) 
        });
        break;

      case 'toggle_anonymous':
        const toggleRoom = getRoom(roomId);
        toggleRoom.anonymous = Boolean(anonymous);
        res.json({ 
          ok: true, 
          state: roomState(roomId) 
        });
        break;

      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/rooms', (req, res) => {
  const { roomId } = req.query;
  if (!roomId) {
    res.status(400).json({ error: 'Room ID required' });
    return;
  }
  
  const state = roomState(roomId);
  res.json(state);
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
