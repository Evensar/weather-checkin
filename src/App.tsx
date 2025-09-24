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
  const [hasLoggedOut, setHasLoggedOut] = useState<boolean>(false)
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false)
  const [selectedSymbol, setSelectedSymbol] = useState<WeatherSymbolKey | null>(null)
  const stateHandlerRef = useRef<((state: RoomState) => void) | null>(null)
  const currentViewRef = useRef<'join' | 'checkin' | 'results'>('join')

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
    
    const stateHandler = (s: RoomState) => {
      console.log('State update received:', s)
      setState(s)
      // Bara sätt view till 'checkin' om användaren inte redan har valt en annan vy
      if (s && s.participants.length > 0 && !hasLoggedOut && currentViewRef.current === 'join') {
        setView('checkin')
        currentViewRef.current = 'checkin'
      }
    }
    
    stateHandlerRef.current = stateHandler
    c.onState(stateHandler)
    
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
    setHasLoggedOut(false); // Återställ logout-flaggan
    const id = await clientRef.current!.createRoom()
    setRoomId(id)
    location.hash = `#/room/${id}`
    
    // Automatiskt gå med i rummet efter det skapats
    const ok = await clientRef.current!.joinRoom(id, alias)
    if (ok) {
      const s = await clientRef.current!.getState()
      setState(s)
      setView('checkin')
      currentViewRef.current = 'checkin'
    }
  }

  async function handleJoin() {
    if (!roomId || !alias) return
    setHasLoggedOut(false); // Återställ logout-flaggan
    const ok = await clientRef.current!.joinRoom(roomId, alias)
    if (ok) {
      const s = await clientRef.current!.getState()
      setState(s)
      setView('checkin')
      currentViewRef.current = 'checkin'
    }
  }

  function pick(symbol: WeatherSymbolKey) {
    if (!state || !alias) {
      console.error('Cannot pick symbol: missing state or alias', { state: !!state, alias });
      return;
    }
    
    console.log('Picking symbol', symbol, 'as', alias);
    setSelectedSymbol(symbol); // Visa loading-state
    
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
    
    // Återställ loading-state efter en kort delay
    setTimeout(() => setSelectedSymbol(null), 800);
  }

  function endRound() {
    clientRef.current!.endRound()
    setView('results')
    currentViewRef.current = 'results'
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
      commentContainer.style.border = '1px solid #d1d5db';
      commentContainer.style.borderRadius = '8px';
      commentContainer.style.backgroundColor = 'white';
      commentContainer.textContent = commentText;
      
      // Ersätt textarean temporärt
      commentField.style.display = 'none';
      commentField.parentNode?.insertBefore(commentContainer, commentField);
    }
    
    // Optimera layout för PDF
    const mainContainer = document.querySelector('.max-w-3xl') as HTMLElement;
    if (mainContainer) {
      mainContainer.style.maxWidth = '100%';
      mainContainer.style.width = '100%';
      mainContainer.style.margin = '0';
      mainContainer.style.padding = '10px';
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
        
        // Återställ main container
        if (mainContainer) {
          mainContainer.style.maxWidth = '';
          mainContainer.style.width = '';
          mainContainer.style.margin = '';
          mainContainer.style.padding = '';
        }
      }, 500);
    }, 200);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex justify-center py-8">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <div className="flex justify-between items-center mb-8">
          <a 
            href={window.location.hostname === 'localhost' ? '/landing.html' : 'landing.html'}
            className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 transition-colors no-print flex items-center gap-1"
            onClick={(e) => {
              console.log('Startsidan-länken klickad');
              console.log('Current hostname:', window.location.hostname);
              console.log('Current URL:', window.location.href);
              console.log('Target href:', e.currentTarget.href);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Startsidan
          </a>
          {state && view !== 'join' && (
            <button 
              onClick={() => {
                setHasLoggedOut(true);
                setView('join');
                currentViewRef.current = 'join';
                setState(null);
                setAlias('');
                location.hash = '';
                // Ta bort state handler först
                if (stateHandlerRef.current) {
                  clientRef.current?.offState(stateHandlerRef.current);
                }
                // Använd RealtimeClient logout-metoden
                clientRef.current?.logout();
                // Rensa även rum-data från localStorage
                localStorage.removeItem('weather-checkin-rooms');
              }} 
              className="rounded-lg bg-blue-700 px-3 py-2 text-white hover:bg-blue-800 no-print"
            >
              Logga ut
            </button>
          )}
        </div>
        <div className="flex justify-between items-center">
          {state && view !== 'join' ? (
            <>
              <div><span className="font-semibold">Rum:</span> {state.roomId}</div>
              <h1 className="text-3xl font-bold absolute left-1/2 transform -translate-x-1/2">Weather Check-In</h1>
              <div className="w-20">{/* Empty div for spacing to balance the title */}</div>
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
                  onClick={() => {
                    setIsCheckingIn(true);
                    setView('checkin');
                    currentViewRef.current = 'checkin';
                    // Återställ loading-state efter en kort delay
                    setTimeout(() => setIsCheckingIn(false), 500);
                  }} 
                  disabled={isCheckingIn}
                  className={`rounded-lg px-3 py-2 text-white transition-all duration-200 ${
                    isCheckingIn 
                      ? 'bg-green-600 cursor-not-allowed' 
                      : view==='checkin' 
                        ? 'bg-blue-700 hover:bg-blue-800' 
                        : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isCheckingIn ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Checkar in...
                    </span>
                  ) : (
                    'Check-in'
                  )}
                </button>
                <button 
                  onClick={() => {
                    setView('results');
                    currentViewRef.current = 'results';
                  }} 
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
                    
                    const isSelecting = selectedSymbol === key;
                    
                    return (
                      <button
                        key={renderKey}
                        onClick={() => pick(key)}
                        disabled={isSelecting}
                        aria-pressed={selected}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-lg transition-all duration-200 ${
                          isSelecting
                            ? 'border-green-500 bg-green-50 ring-2 ring-green-200 cursor-not-allowed'
                            : selected 
                              ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' 
                              : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        {isSelecting ? (
                          <div className="flex flex-col items-center gap-2">
                            <svg className="animate-spin h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-sm font-medium text-green-600">Väljer...</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-4xl">{s.emoji}</span>
                            <span>{s.label}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
      </div>
              </section>
            )}

            {view === 'results' && (
              <section className="mt-2 page-break-avoid">
                <h2 className="text-3xl font-semibold mb-10 text-center">Resultat</h2>
                <div className="grid gap-10 page-break-avoid">
                  <div className="flex justify-center mb-4 no-print">
                    <button 
                      onClick={() => {
                        setView('checkin');
                        currentViewRef.current = 'checkin';
                      }} 
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      ← Tillbaka till Check-in
        </button>
                  </div>
                  
                  <div className="rounded-xl bg-gray-50 p-4 page-break-avoid">
                    <h3 className="font-semibold mb-3">Kommentar</h3>
                    <textarea 
                      className="w-full p-3 border rounded-lg min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      placeholder="Lägg till en kommentar om denna check-in..."
                      id="comment-field"
                    ></textarea>
                  </div>
                  
                  <div className="rounded-xl bg-gray-50 p-4 page-break-avoid">
                    <h3 className="font-semibold mb-3">Summering</h3>
                    <div className="flex flex-wrap gap-3 page-break-avoid">
                      {summaryPairs.map(([key, count]) => (
                        <div key={key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                          <span className="text-2xl">{WEATHER_SYMBOLS[key].emoji}</span>
                          <strong>{count}</strong>
                          <span className="text-gray-600">{WEATHER_SYMBOLS[key].label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4 page-break-avoid">
                    <h3 className="font-semibold mb-3">Ikon-grid</h3>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 page-break-avoid">
                      {state.participants.map((p, idx) => (
                        <div key={idx} className="text-center">
                          <div className="text-2xl">{p.symbol ? WEATHER_SYMBOLS[p.symbol].emoji : '❓'}</div>
                          {!state.anonymous && <div className="text-xs text-gray-500 truncate">{p.name}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4 page-break-avoid">
                    <h3 className="font-semibold mb-3">Lista</h3>
                    <ul className="space-y-1 page-break-avoid">
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
