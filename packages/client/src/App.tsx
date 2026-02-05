import { useState, useEffect } from 'react';
import { HexBoard } from './components/HexBoard';
import { Lobby } from './components/Lobby';
import { Tile, GameState, PlayerColor, Player, GameStatus, RoomInfo, Building } from '@cax/shared';
import { io, Socket } from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify'; 
import { ResourcePanel } from './components/ResourcePanel';
import { ActionPanel } from './components/ActionPanel';
import { TradePanel } from './components/TradePanel'; // EKLENDİ

let socket: Socket;

function App() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isInGame, setIsInGame] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.LOBBY);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [turnSubPhase, setTurnSubPhase] = useState<'settlement' | 'road' | 'city' | 'waiting'>('waiting');
  const [myId, setMyId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [hasRolled, setHasRolled] = useState(false);
  const [currentOffer, setCurrentOffer] = useState<any>(null);
  const [possibleVictims, setPossibleVictims] = useState<string[]>([]); // Kurban ID listesi
  

  useEffect(() => {
    socket = io('http://localhost:3001', { transports: ['websocket'] });
    socket.on('connect', () => { setIsConnected(true); setMyId(socket.id || null); });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('room_list_update', (roomList: RoomInfo[]) => setRooms(roomList));
    socket.on('game_state_update', (gameState: GameState) => {
      setTiles(gameState.tiles);
      setPlayers(gameState.players);
      setGameStatus(gameState.status);
      setActivePlayerId(gameState.activePlayerId);
      setHostId(gameState.hostId);
      setBuildings(gameState.buildings);
      if (gameState.currentTradeOffer !== undefined) setCurrentOffer(gameState.currentTradeOffer);
      if (gameState.turnSubPhase) setTurnSubPhase(gameState.turnSubPhase);
    });
    socket.on('dice_result', (data: { die1: number, die2: number, total: number }) => {
       setHasRolled(true);
       toast.info(`🎲 Zar: ${data.total} (${data.die1}+${data.die2})`, { autoClose: 3000, theme: "dark" });
    });

    socket.on('robber_victims', (data: { victims: string[] }) => {
       if (data.victims.length === 1) {
         // Tek kişi varsa direkt soy
         socket.emit('rob_player', { victimId: data.victims[0] });
         setTurnSubPhase('waiting');
       } else {
         // Birden fazla kişi varsa listeyi state'e at (Modal açılır)
         setPossibleVictims(data.victims);
       }
    });

    socket.on('join_success', () => setIsInGame(true));
    socket.on('error_message', (data: { message: string }) => toast.error(data.message));
    socket.on('system_alert', (data: { message: string }) => toast.info(data.message));
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => { if (activePlayerId === myId) setHasRolled(false); }, [activePlayerId, myId]);

  const handleRollDice = () => socket.emit('roll_dice');
  const handleEndTurn = () => { socket.emit('end_turn'); setHasRolled(false); setTurnSubPhase('waiting'); };
  const startBuildRoad = () => setTurnSubPhase('road');
  const startBuildCity = () => setTurnSubPhase('city');
  const startBuildSettlement = () => setTurnSubPhase('settlement');
  const cancelBuild = () => setTurnSubPhase('waiting');
  const handleCreateRoom = (roomName: string, pass: string, playerName: string, color: PlayerColor) => socket.emit('create_room', { roomName, password: pass, playerName, playerColor: color });
  const handleJoinRoom = (roomId: string, pass: string, playerName: string, color: PlayerColor) => socket.emit('join_room', { roomId, password: pass, playerName, playerColor: color });
  const handleStartGame = () => socket.emit('start_game');
  const handleVertexClick = (q: number, r: number, i: number) => {
    if (activePlayerId === myId) {
        if (turnSubPhase === 'settlement') {
            socket.emit('build_settlement', { q, r, vertexIndex: i });
        } else if (turnSubPhase === 'city') {
            // YENİ: Şehir Kurma İsteği
            socket.emit('upgrade_to_city', { q, r, vertexIndex: i });
        }
    }
  };
  const handleEdgeClick = (q: number, r: number, i: number) => {
    if (activePlayerId === myId) {
       // İnşaat Modu
       if (turnSubPhase === 'road') {
         socket.emit('build_road', { q, r, edgeIndex: i });
       } 
       // Sabotaj Modu
       else if ((turnSubPhase as any) === 'sabotage') {
         socket.emit('sabotage_road', { q, r, edgeIndex: i });
       }
    }
  };
  
  const handleTileClick = (q: number, r: number) => {
    if (activePlayerId === myId && (turnSubPhase as any) === 'robber') {
      socket.emit('move_robber', { q, r });
    }
  };

  const handleBuyCard = () => socket.emit('buy_card');

  const handlePlayCard = (cardType: any) => {
    socket.emit('play_card', { cardType });
  };

  // Kurban Seçildiğinde
  const handleSelectVictim = (victimId: string) => {
    socket.emit('rob_player', { victimId });
    setPossibleVictims([]); // Modalı kapat
    setTurnSubPhase('waiting');
  };
  
  // TİCARET FONKSİYONLARI (EKLENDİ)
  const handleBankSell = (res: any) => socket.emit('trade_with_bank', { resource: res });
  const handleBankBuy = (res: any) => socket.emit('buy_black_market', { resource: res });

  const handleCreateOffer = (give: any, want: any) => socket.emit('create_p2p_offer', { give, want });
const handleAcceptOffer = () => socket.emit('accept_p2p_offer');
const handleFinalizeTrade = (partnerId: string) => socket.emit('finalize_p2p_offer', { partnerId });
const handleCancelOffer = () => socket.emit('cancel_p2p_offer');

  const activePlayer = players.find(p => p.id === activePlayerId);
  const isMyTurn = activePlayerId === myId;

  return (
    <div className="h-screen w-screen bg-[#0f172a] text-white flex flex-col overflow-hidden font-sans">
      <ToastContainer position="top-center" theme="dark" />
      <header className="h-20 bg-slate-800/80 backdrop-blur-md border-b border-slate-700 flex items-center justify-between px-6 shadow-lg z-20 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-sm">MERCATOR</h1>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
        </div>
        {isInGame && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
             <div className="bg-slate-900/50 px-5 py-2 rounded-full border border-slate-600/50 flex items-center gap-3">
                <span className="text-gray-400 text-sm uppercase tracking-wider font-bold">TUR</span>
                <span className="text-white font-mono font-bold text-lg">{gameStatus}</span>
             </div>
             {gameStatus === GameStatus.LOBBY && myId === hostId && players.length > 1 && (
               <button onClick={handleStartGame} className="bg-green-600 hover:bg-green-500 text-white px-8 py-2 rounded-full font-bold shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-all transform hover:scale-105 active:scale-95">BAŞLAT 🚀</button>
             )}
          </div>
        )}
        {isInGame && (
          <div className="flex items-center gap-3 bg-slate-900/40 px-4 py-2 rounded-xl border border-slate-700/50">
            <div className="text-right">
              <div className="text-[10px] text-gray-400 uppercase font-bold">SIRADAKİ</div>
              <div className="font-bold text-lg leading-none">{activePlayer?.name || "..."}</div>
            </div>
            <div className="w-8 h-8 rounded-lg shadow-inner border-2 border-slate-600" style={{backgroundColor: activePlayer?.color || 'gray'}}></div>
          </div>
        )}
      </header>

      <main className="flex-1 relative flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950 overflow-hidden">
        {!isInGame && <div className="z-10 w-full max-w-4xl px-4"><Lobby rooms={rooms} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} /></div>}
        {isInGame && (
          <>
            <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
              {players.map(p => (
                <div key={p.id} className={`flex items-center gap-3 px-4 py-2 rounded-lg backdrop-blur-sm border transition-all ${activePlayerId === p.id ? 'bg-slate-700/80 border-yellow-500/50 shadow-lg translate-x-2' : 'bg-slate-800/40 border-slate-700/30'}`}>
                  <div className="w-3 h-3 rounded-full shadow-[0_0_5px_currentColor]" style={{backgroundColor: p.color, color: p.color}}></div>
                  <span className={`text-sm font-bold ${activePlayerId === p.id ? 'text-white' : 'text-gray-400'}`}>{p.name}</span>
                  {hostId === p.id && <span className="text-xs">👑</span>}
                </div>
              ))}
            </div>
            {isMyTurn && (turnSubPhase === 'settlement' || turnSubPhase === 'road') && (
               <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 animate-bounce">
                  <div className="bg-yellow-500 text-slate-900 px-8 py-3 rounded-full font-black shadow-[0_0_20px_rgba(234,179,8,0.5)] border-4 border-slate-900 text-xl tracking-wide">
                    {turnSubPhase === 'settlement' ? "👇 KÖY KUR" : "👇 YOL KUR"}
                  </div>
               </div>
            )}
            <div className="relative z-0 scale-100 transition-transform duration-700 ease-out">
               <HexBoard 
                 tiles={tiles} 
                 buildings={buildings} 
                 players={players} 
                 onVertexClick={handleVertexClick} 
                 onEdgeClick={handleEdgeClick}
                 onTileClick={handleTileClick} // YENİ PROP
               />
            </div>
          </>
        )}
        {/* HIRSIZ MODU BİLDİRİMİ */}
            {isMyTurn && (turnSubPhase as any) === 'robber' && (
               <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                  <div className="bg-red-600 text-white px-6 py-4 rounded-full font-black shadow-2xl border-4 border-slate-900 text-xl flex items-center gap-2">
                    <span>👮</span> VERGİ MEMURUNU TAŞI! (Bir araziye tıkla)
                  </div>
               </div>
            )}

            {/* --- KURBAN SEÇİM MODALI --- */}
        {possibleVictims.length > 0 && (
          <div className="absolute inset-0 bg-black/60 z-[60] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-slate-800 p-8 rounded-2xl border-2 border-red-500 shadow-2xl text-center">
              <h2 className="text-2xl font-black text-white mb-4">👮 KİME CEZA KESİLSİN?</h2>
              <div className="grid grid-cols-2 gap-4">
                {possibleVictims.map(vId => {
                  const p = players.find(player => player.id === vId);
                  return (
                    <button 
                      key={vId}
                      onClick={() => handleSelectVictim(vId)}
                      className="bg-slate-700 hover:bg-red-600 text-white p-4 rounded-xl font-bold transition-all border border-slate-600 hover:scale-105 flex flex-col items-center"
                    >
                      <div className="w-8 h-8 rounded-full mb-2" style={{backgroundColor: p?.color}}></div>
                      {p?.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

       {isInGame && isMyTurn && gameStatus === GameStatus.PLAYING && !hasRolled && (
         <div className="absolute right-10 bottom-10 z-50">
            <button onClick={handleRollDice} className="bg-red-600 hover:bg-red-500 text-white w-24 h-24 rounded-full font-black text-xl shadow-[0_0_30px_rgba(220,38,38,0.6)] border-4 border-slate-900 transition-transform active:scale-90 flex flex-col items-center justify-center gap-1">
              <span>🎲</span><span>ZAR AT</span>
            </button>
         </div>
       )}

       {isInGame && isMyTurn && gameStatus === GameStatus.PLAYING && hasRolled && (
          <ActionPanel 
            onBuildRoad={startBuildRoad}
            onBuildSettlement={startBuildSettlement}
            onBuildCity={startBuildCity} 
            onBuyCard={handleBuyCard}
            onEndTurn={handleEndTurn}
            isBuilding={turnSubPhase === 'road' || turnSubPhase === 'settlement' || turnSubPhase === 'city' ? turnSubPhase : null}
            onCancelBuild={cancelBuild}
          />
       )}

       {/* TİCARET PANELİ */}
       {isInGame  && gameStatus === GameStatus.PLAYING && (
          <TradePanel 
   onBankSell={handleBankSell} 
   onBankBuy={handleBankBuy}
   onCreateOffer={handleCreateOffer}
   onAcceptOffer={handleAcceptOffer}
   onFinalizeTrade={handleFinalizeTrade}
   onCancelOffer={handleCancelOffer}
   currentOffer={currentOffer}
   myId={myId || ''}
   players={players}
/>
    )}

       {/* KAYNAK VE KART PANELİ */}
       {isInGame && activePlayer && myId && (
          <ResourcePanel 
            resources={players.find(p => p.id === myId)?.resources || {} as any} 
            devCards={players.find(p => p.id === myId)?.devCards || {} as any}
            onPlayCard={handlePlayCard} // BAĞLANDI
            isMyTurn={isMyTurn} // BAĞLANDI
          />
       )}


      {/* Bildirim Alanı (Return içinde uygun yere ekle)*/}
      {isMyTurn && (turnSubPhase as any) === 'sabotage' && (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
        <div className="bg-orange-600 text-white px-6 py-4 rounded-full font-black shadow-2xl border-4 border-slate-900 text-xl flex items-center gap-2">
          <span>💣</span> YIKILACAK YOLU SEÇ!
        </div>
      </div>
  )}

      </main>
    </div>
  );
}
export default App;