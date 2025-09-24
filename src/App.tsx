import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { RealtimeClient, type RoomState } from './realtime'
import { WEATHER_SYMBOLS, WEATHER_ORDER, type WeatherSymbolKey } from './symbols'

function App() {
  const clientRef = useRef<RealtimeClient | null>(null)
  const [roomId, setRoomId] = useState<string>('')
  const [alias, setAlias] = useState<string>('')
  const [state, setState] = useState<RoomState | null>(null)
  const [view, setView] = useState<'join' | 'checkin' | 'results'>('join')

  useEffect(() => {
    const c = new RealtimeClient()
    clientRef.current = c
    c.onState((s) => {
      setState(s)
      setView('checkin')
    })
    return () => {
      // no explicit disconnect required; page unload will close
    }
  }, [])

  useEffect(() => {
    // parse room from URL hash: #/room/abcd12
    const m = location.hash.match(/#\/room\/([a-z0-9]+)/i)
    if (m) setRoomId(m[1])
  }, [])

  const summaryPairs = useMemo(() => {
    if (!state) return [] as Array<[WeatherSymbolKey, number]>
    return WEATHER_ORDER.map((k) => [k, state.summary[k] || 0]) as Array<[WeatherSymbolKey, number]>
  }, [state])

  async function handleCreateRoom() {
    const id = await clientRef.current!.createRoom()
    setRoomId(id)
    location.hash = `#/room/${id}`
  }

  async function handleJoin() {
    if (!roomId || !alias) return
    const ok = await clientRef.current!.joinRoom(roomId, alias)
    if (ok) {
      const s = await clientRef.current!.getState()
      setState(s)
      setView('checkin')
    }
  }

  function pick(symbol: WeatherSymbolKey) {
    if (!state || !alias) return;
    
    // Update the participant directly
    const room = { ...state };
    const participantIndex = room.participants.findIndex(p => p.name === alias);
    if (participantIndex >= 0) {
      room.participants[participantIndex].symbol = symbol;
    } else {
      room.participants.push({ name: alias, symbol });
    }
    
    // Update summary
    const summary: Record<string, number> = { sun: 0, partly: 0, cloud: 0, rain: 0, storm: 0 };
    room.participants.forEach(p => {
      if (p.symbol) {
        summary[p.symbol] = (summary[p.symbol] || 0) + 1;
      }
    });
    room.summary = summary;
    
    setState(room);
    clientRef.current!.select(symbol);
  }

  function endRound() {
    clientRef.current!.endRound()
    setView('results')
  }

  function toggleAnonymous() {
    if (!state) return
    clientRef.current!.setAnonymous(!state.anonymous)
  }

  function exportPDF() {
    // Simple approach: use browser print to save as PDF
    window.print()
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <h1 className="text-3xl font-bold text-center mb-6">Weather Check-In</h1>

        {view === 'join' && (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Namn eller alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                aria-label="Namn eller alias"
              />
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Rums-ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                aria-label="Rums-ID"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleJoin}
                disabled={!alias || !roomId}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Gå med
              </button>
              <button
                onClick={handleCreateRoom}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
              >
                Skapa rum
              </button>
              {roomId && (
                <button
                  onClick={() => navigator.clipboard.writeText(location.href)}
                  className="inline-flex items-center justify-center rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
                >
                  Kopiera länk
                </button>
              )}
            </div>
          </div>
        )}

        {state && view !== 'join' && (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-3 border-b pb-4">
              <div><span className="font-semibold">Rum:</span> {state.roomId}</div>
              <div className="ml-auto flex flex-wrap gap-3 no-print">
                <button onClick={toggleAnonymous} className="rounded-lg bg-purple-600 px-3 py-2 text-white hover:bg-purple-700">
                  {state.anonymous ? 'Icke-anonymt läge' : 'Anonymt läge'}
                </button>
                <button onClick={() => setView('checkin')} className={`rounded-lg px-3 py-2 hover:bg-gray-100 ${view==='checkin' ? 'bg-gray-100' : 'bg-white'} border`}>Check-in</button>
                <button onClick={() => setView('results')} className={`rounded-lg px-3 py-2 hover:bg-gray-100 ${view==='results' ? 'bg-gray-100' : 'bg-white'} border`}>Resultat</button>
                <button onClick={exportPDF} className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700">Exportera till PDF</button>
                {!state.ended && <button onClick={endRound} className="rounded-lg bg-rose-600 px-3 py-2 text-white hover:bg-rose-700">Avsluta omgång</button>}
              </div>
            </div>

            {view === 'checkin' && (
              <section>
                <h2 className="text-xl font-semibold mb-4 text-center">Välj ditt väder</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {WEATHER_ORDER.map((key) => {
                    const s = WEATHER_SYMBOLS[key]
                    const selected = state?.participants.find((p) => p.name === alias)?.symbol === key
                    return (
                      <button
                        key={key}
                        onClick={() => pick(key)}
                        aria-pressed={selected}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-lg transition-colors ${selected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}
                      >
                        <span className="text-4xl">{s.emoji}</span>
                        <span>{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {view === 'results' && (
              <section>
                <h2 className="text-xl font-semibold mb-4 text-center">Resultat</h2>
                <div className="grid gap-6">
                  <div className="rounded-xl bg-gray-50 p-4">
                    <h3 className="font-semibold mb-3">Summering</h3>
                    <div className="flex flex-wrap gap-3">
                      {summaryPairs.map(([key, count]) => (
                        <div key={key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                          <span className="text-2xl">{WEATHER_SYMBOLS[key].emoji}</span>
                          <strong>{count}</strong>
                          <span className="text-gray-600">{WEATHER_SYMBOLS[key].label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <h3 className="font-semibold mb-3">Ikon-grid</h3>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                      {state.participants.map((p, idx) => (
                        <div key={idx} className="text-center">
                          <div className="text-2xl">{p.symbol ? WEATHER_SYMBOLS[p.symbol].emoji : '❓'}</div>
                          {!state.anonymous && <div className="text-xs text-gray-500 truncate">{p.name}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <h3 className="font-semibold mb-3">Lista</h3>
                    <ul className="space-y-1">
                      {(!state.anonymous ? state.participants : []).map((p, idx) => (
                        <li key={idx} className="flex items-center justify-between rounded-md bg-white px-3 py-2 shadow-sm">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-gray-700">{p.symbol ? WEATHER_SYMBOLS[p.symbol].label : '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
