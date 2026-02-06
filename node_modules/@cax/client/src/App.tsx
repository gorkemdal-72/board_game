import { useState, useEffect } from 'react';
import { HexBoard } from './components/HexBoard';
import { Lobby } from './components/Lobby';
import { Tile, GameState, PlayerColor, Player, GameStatus, RoomInfo, Building, BuildingType } from '@cax/shared';
import { io, Socket } from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import { ResourcePanel } from './components/ResourcePanel';
import { ActionPanel } from './components/ActionPanel';
import { TradePanel } from './components/TradePanel';
import { BuildCostPanel } from './components/BuildCostPanel';

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

  // MERCATOR: Yeni State'ler
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [longestRoadPlayerId, setLongestRoadPlayerId] = useState<string | null>(null);
  const [largestArmyPlayerId, setLargestArmyPlayerId] = useState<string | null>(null);
  const [activeCartelPlayerId, setActiveCartelPlayerId] = useState<string | null>(null);

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

      // MERCATOR: Yeni Alanlar
      setWinnerId((gameState as any).winnerId || null);
      setLongestRoadPlayerId((gameState as any).longestRoadPlayerId || null);
      setLargestArmyPlayerId((gameState as any).largestArmyPlayerId || null);
      setActiveCartelPlayerId((gameState as any).activeCartelPlayerId || null);
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
      // Enkaz kontrolü - enkaz varsa tamir et
      const debris = buildings.find(b =>
        b.type === 'debris' &&
        b.coord.q === q &&
        b.coord.r === r &&
        b.coord.edgeIndex === i
      );

      if (debris) {
        socket.emit('repair_debris', { q, r, edgeIndex: i });
        return;
      }

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
      <header className="h-16 bg-slate-800 border-b border-slate-600 flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">MERCATOR</h1>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        {isInGame && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
            <div className="bg-slate-700 px-4 py-2 rounded-lg flex items-center gap-3">
              <span className="text-gray-400 text-sm">Durum:</span>
              <span className="text-white font-semibold">{gameStatus}</span>
            </div>
            {gameStatus === GameStatus.LOBBY && myId === hostId && players.length > 1 && (
              <button onClick={handleStartGame} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors">
                BAŞLAT 🚀
              </button>
            )}
          </div>
        )}
        {isInGame && (
          <div className="flex items-center gap-3 bg-slate-700 px-4 py-2 rounded-lg">
            <div className="text-right">
              <div className="text-xs text-gray-400">Sıradaki</div>
              <div className="font-semibold">{activePlayer?.name || "..."}</div>
            </div>
            <div className="w-6 h-6 rounded" style={{ backgroundColor: activePlayer?.color || 'gray' }}></div>
          </div>
        )}
      </header>

      <main className="flex-1 relative flex items-center justify-center bg-slate-900 overflow-hidden">
        {!isInGame && <div className="z-10 w-full max-w-4xl px-4"><Lobby rooms={rooms} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} /></div>}
        {isInGame && (
          <>
            {/* OYUNCU LİSTESİ */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
              {players.map(p => {
                const isActive = activePlayerId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isActive
                        ? 'bg-slate-700 border-yellow-500'
                        : 'bg-slate-800/80 border-slate-600'
                      }`}
                  >
                    {/* Renk */}
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />

                    {/* İsim */}
                    <span className={`font-medium text-sm ${isActive ? 'text-white' : 'text-gray-300'}`}>
                      {p.name}
                    </span>

                    {/* VP */}
                    <span className="bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded text-xs font-semibold">
                      {p.victoryPoints} VP
                    </span>

                    {/* Rozetler */}
                    {hostId === p.id && <span title="Host">👑</span>}
                    {longestRoadPlayerId === p.id && <span title="En Uzun Yol">🛤️</span>}
                    {largestArmyPlayerId === p.id && <span title="En Güçlü Ordu">⚔️</span>}
                    {activeCartelPlayerId === p.id && <span title="Kartel">🏴‍☠️</span>}
                  </div>
                );
              })}
            </div>

            {/* İNŞAAT MALİYETLERİ PANELİ - Sol Alt */}
            {(() => {
              const me = players.find(p => p.id === myId);
              if (!me) return null;
              const myBuildings = buildings.filter(b => b.ownerId === myId);
              return (
                <div className="absolute bottom-6 left-6 z-20">
                  <BuildCostPanel
                    playerResources={me.resources}
                    buildingCounts={{
                      settlements: myBuildings.filter(b => b.type === BuildingType.SETTLEMENT).length,
                      cities: myBuildings.filter(b => b.type === BuildingType.CITY).length,
                      roads: myBuildings.filter(b => b.type === BuildingType.ROAD).length,
                    }}
                  />
                </div>
              );
            })()}

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

        {/* KARTEL AKTİF BANNER */}
        {activeCartelPlayerId && (
          <div className="absolute top-4 right-6 z-40">
            <div className="bg-gradient-to-r from-purple-900 to-red-900 text-white px-6 py-3 rounded-xl font-bold shadow-2xl border-2 border-red-500 flex items-center gap-3 animate-pulse">
              <span className="text-2xl">🏴‍☠️</span>
              <div>
                <div className="text-xs text-red-300 uppercase">KARTEL AKTİF!</div>
                <div className="font-black">{players.find(p => p.id === activeCartelPlayerId)?.name} TÜM KAYNAKLARI ALIYOR</div>
              </div>
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
                      <div className="w-8 h-8 rounded-full mb-2" style={{ backgroundColor: p?.color }}></div>
                      {p?.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* === OYUN SONU MODALI === */}
        {gameStatus === GameStatus.FINISHED && winnerId && (
          <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-md">
            <div className="bg-gradient-to-b from-yellow-900/90 to-slate-900/90 p-10 rounded-3xl border-4 border-yellow-500 shadow-[0_0_60px_rgba(234,179,8,0.5)] text-center max-w-lg">
              {/* Konfeti Efekti */}
              <div className="text-6xl mb-4 animate-bounce">🏆</div>

              <h1 className="text-4xl font-black text-yellow-400 mb-2 tracking-wider">
                OYUN BİTTİ!
              </h1>

              <div className="text-2xl text-white font-bold mb-6">
                🎉 {players.find(p => p.id === winnerId)?.name} KAZANDI! 🎉
              </div>

              <div className="w-20 h-20 rounded-full mx-auto mb-6 border-4 border-yellow-400 shadow-[0_0_30px_rgba(234,179,8,0.6)]"
                style={{ backgroundColor: players.find(p => p.id === winnerId)?.color }}>
              </div>

              {/* SKOR TABLOSU */}
              <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                <h3 className="text-sm text-gray-400 uppercase font-bold mb-3">SKOR TABLOSU</h3>
                <div className="space-y-2">
                  {players
                    .sort((a, b) => b.victoryPoints - a.victoryPoints)
                    .map((p, idx) => (
                      <div key={p.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${idx === 0 ? 'bg-yellow-500/20' : 'bg-slate-700/30'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  '}</span>
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div>
                          <span className="font-bold text-white">{p.name}</span>
                        </div>
                        <span className="text-yellow-400 font-bold">{p.victoryPoints} VP</span>
                      </div>
                    ))}
                </div>
              </div>

              <p className="text-gray-400 text-sm">
                Yeni oyun için sayfayı yenileyin
              </p>
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
        {isInGame && gameStatus === GameStatus.PLAYING && (
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
            buildings={buildings}
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