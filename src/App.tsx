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
    
    // Återställ användarnamn från tidigare session om det finns
    const savedSession = localStorage.getItem('weather-checkin-session')
    if (savedSession) {
      try {
        const { userName } = JSON.parse(savedSession)
        if (userName) setAlias(userName)
      } catch (e) {
        console.error('Failed to parse session:', e)
      }
    }
    
    c.onState((s) => {
      console.log('State update received:', s)
      setState(s)
      if (s && s.participants.length > 0) {
        setView('checkin')
      }
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
    if (!alias) {
      alert('Ange ditt namn eller alias först')
      return
    }
    const id = await clientRef.current!.createRoom()
    setRoomId(id)
    location.hash = `#/room/${id}`
    
    // Automatiskt gå med i rummet efter det skapats
    const ok = await clientRef.current!.joinRoom(id, alias)
    if (ok) {
      const s = await clientRef.current!.getState()
      setState(s)
      setView('checkin')
    }
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
    if (!state || !alias) {
      console.error('Cannot pick symbol: missing state or alias', { state: !!state, alias });
      return;
    }
    
    console.log('Picking symbol', symbol, 'as', alias);
    
    // Update the participant directly for immediate UI feedback
    const room = JSON.parse(JSON.stringify(state)) as RoomState; // Deep clone
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
    
    // Uppdatera state omedelbart för direkt UI-feedback
    setState(room);
    
    // Skicka valet till servern och uppdatera alla klienter
    clientRef.current!.select(symbol);
    
    // Forcera en omrendering för att säkerställa att valet visas direkt
    setTimeout(() => {
      setState(prevState => {
        if (!prevState) return prevState;
        return {...prevState};
      });
    }, 50);
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
    // Sätt temporärt en klass på body för att optimera utskrift
    document.body.classList.add('printing');
    
    // Spara kommentarstexten för att säkerställa att den visas korrekt i PDF
    const commentField = document.getElementById('comment-field') as HTMLTextAreaElement;
    let commentText = '';
    if (commentField) {
      commentText = commentField.value;
      
      // Skapa en temporär div som ersätter textarean för bättre visning i PDF
      const commentContainer = document.createElement('div');
      commentContainer.id = 'comment-text-for-pdf';
      commentContainer.style.whiteSpace = 'pre-wrap';
      commentContainer.style.minHeight = '100px';
      commentContainer.style.padding = '12px';
      commentContainer.textContent = commentText;
      
      // Ersätt textarean temporärt
      commentField.style.display = 'none';
      commentField.parentNode?.insertBefore(commentContainer, commentField);
    }
    
    // Vänta lite så att CSS-ändringar hinner appliceras
    setTimeout(() => {
      // Använd webbläsarens utskriftsfunktion
      window.print();
      
      // Ta bort den temporära klassen och återställ kommentarsfältet efter utskrift
      setTimeout(() => {
        document.body.classList.remove('printing');
        
        // Återställ kommentarsfältet
        if (commentField) {
          commentField.style.display = '';
          const tempDiv = document.getElementById('comment-text-for-pdf');
          if (tempDiv) {
            tempDiv.remove();
          }
        }
      }, 500);
    }, 100);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex justify-center py-8">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <div className="flex justify-between items-center">
          {state && view !== 'join' ? (
            <>
              <div><span className="font-semibold">Rum:</span> {state.roomId}</div>
              <h1 className="text-3xl font-bold absolute left-1/2 transform -translate-x-1/2">Weather Check-In</h1>
              <button 
                onClick={() => {
                  setView('join');
                  setState(null);
                  setAlias('');
                  location.hash = '';
                  localStorage.removeItem('weather-checkin-session');
                }} 
                className="rounded-lg bg-blue-700 px-3 py-2 text-white hover:bg-blue-800 no-print"
              >
                Logga ut
              </button>
            </>
          ) : (
            <div className="w-full">{/* Empty div for spacing when not showing room */}</div>
          )}
        </div>

        {view === 'join' && (
          <div className="flex flex-col items-center justify-center h-[60vh]">
            <h1 className="text-3xl font-bold mb-12">Weather Check-In</h1>
            <div className="w-full max-w-md">
              <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="flex flex-wrap justify-center gap-4">
                  <button
                    onClick={handleJoin}
                    disabled={!alias || !roomId}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Gå med
                  </button>
                  <button
                    onClick={handleCreateRoom}
                    disabled={!alias}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
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
            </div>
          </div>
        )}

        {state && view !== 'join' && (
          <div className="grid gap-6">
            <div className="flex flex-col gap-6 border-b pb-6 mb-6 mt-12">
              
              <div className="flex flex-wrap justify-center gap-5 no-print mt-6">
                <button 
                  onClick={toggleAnonymous} 
                  className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
                >
                  {state.anonymous ? 'Icke-anonymt läge' : 'Anonymt läge'}
                </button>
                <button 
                  onClick={() => setView('checkin')} 
                  className={`rounded-lg px-3 py-2 text-white hover:bg-blue-700 ${view==='checkin' ? 'bg-blue-700' : 'bg-blue-600'}`}
                >
                  Check-in
                </button>
                <button 
                  onClick={() => setView('results')} 
                  className={`rounded-lg px-3 py-2 text-white hover:bg-blue-700 ${view==='results' ? 'bg-blue-700' : 'bg-blue-600'}`}
                >
                  Resultat
                </button>
                {view === 'results' && (
                  <button 
                    onClick={exportPDF} 
                    className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
                  >
                    Exportera till PDF
                  </button>
                )}
                <button 
                  onClick={endRound} 
                  disabled={state.ended}
                  className={`rounded-lg px-3 py-2 text-white hover:bg-blue-800 ${state.ended ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-700'}`}
                >
                  {state.ended ? 'Omgång avslutad' : 'Avsluta omgång'}
                </button>
              </div>
            </div>

            {view === 'checkin' && (
              <section className="mt-2">
                <h2 className="text-3xl font-semibold mb-10 text-center">Välj ditt väder</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                  {WEATHER_ORDER.map((key) => {
                    const s = WEATHER_SYMBOLS[key]
                    // Hitta användarens val genom att söka efter alias i deltagarlistan
                    const currentUser = state?.participants.find((p) => p.name === alias);
                    const selected = currentUser?.symbol === key;
                    
                    // Forcera omrendering med key för att säkerställa att UI uppdateras
                    const renderKey = `${key}-${selected}-${Date.now()}`;
                    
                    console.log(`Symbol ${key}: selected=${selected}`, 
                      { alias, currentUser: currentUser?.name, currentSymbol: currentUser?.symbol, renderKey });
                    
                    return (
                      <button
                        key={renderKey}
                        onClick={() => pick(key)}
                        aria-pressed={selected}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-lg transition-colors ${
                          selected 
                            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
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
              <section className="mt-2">
                <h2 className="text-3xl font-semibold mb-10 text-center">Resultat</h2>
                <div className="grid gap-10">
                  <div className="flex justify-center mb-4 no-print">
                    <button 
                      onClick={() => setView('checkin')} 
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      ← Tillbaka till Check-in
        </button>
                  </div>
                  
                  <div className="rounded-xl bg-gray-50 p-4">
                    <h3 className="font-semibold mb-3">Kommentar</h3>
                    <textarea 
                      className="w-full p-3 border rounded-lg min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      placeholder="Lägg till en kommentar om denna check-in..."
                      id="comment-field"
                    ></textarea>
                  </div>
                  
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
