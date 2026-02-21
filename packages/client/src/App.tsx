import { useState, useEffect, useCallback } from 'react';
import { HexBoard } from './components/HexBoard';
import { Lobby } from './components/Lobby';
import { Tile, GameState, PlayerColor, Player, GameStatus, RoomInfo, Building, BuildingType, ResourceType, DevCardType, hexToPixel, getHexCorners } from '@cumor/shared';
import { io, Socket } from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import { ResourcePanel, MobileResourcePanel, MobileDevCardPanel } from './components/ResourcePanel';
import { ActionPanel, MobileActionPanel } from './components/ActionPanel';
import { TradePanel, MobileTradePanel } from './components/TradePanel';
import { BuildCostPanel, MobileBuildCostPanel } from './components/BuildCostPanel';
import { ChatPanel } from './components/ChatPanel';
import { AuthScreen } from './components/AuthScreen';
import { ProfilePanel } from './components/ProfilePanel';

let socket: Socket;

// Socket URL
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const socketUrl = isLocal ? 'http://localhost:3001' : 'https://cumorserver-production.up.railway.app';

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

  // CUMOR: Yeni State'ler
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [longestRoadPlayerId, setLongestRoadPlayerId] = useState<string | null>(null);
  const [largestArmyPlayerId, setLargestArmyPlayerId] = useState<string | null>(null);
  const [activeCartelPlayerId, setActiveCartelPlayerId] = useState<string | null>(null);
  const [startRolls, setStartRolls] = useState<{ playerId: string, roll: number | null }[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false); // CHAT STATE
  const [highlightNumber, setHighlightNumber] = useState<number | null>(null); // ZAR SONUCU (Tile Highlight İçin)

  // YENİ: Mercator kartı kaynak seçim modalı
  const [showMercatorModal, setShowMercatorModal] = useState(false);
  // YENİ: Tüccar kartı kaynak seçim modalı
  const [showTraderModal, setShowTraderModal] = useState(false);
  // Admin panel durumu
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  // Ücretsiz yol ve tüccar kalan hakkı
  const [freeRoadsRemaining, setFreeRoadsRemaining] = useState(0);
  const [traderPicksRemaining, setTraderPicksRemaining] = useState(0);
  // Destede kalan kart sayısı ve admin kaynak verme miktarı
  const [devCardDeckCount, setDevCardDeckCount] = useState(0);
  const [adminResourceAmount, setAdminResourceAmount] = useState(5);

  // HESAP SİSTEMİ STATE'LERİ
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('cumor_token'));
  const [authUserId, setAuthUserId] = useState<string | null>(localStorage.getItem('cumor_userId'));
  const [authUsername, setAuthUsername] = useState<string>(localStorage.getItem('cumor_username') || '');
  const [authIsAdmin, setAuthIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // MOBİL RESPONSIVE STATE
  const [activeMobilePanel, setActiveMobilePanel] = useState<'none' | 'trade' | 'actions' | 'costs' | 'cards'>('none');


  // Socket bağlantısını başlat (token ile)
  const connectSocket = useCallback((token: string | null) => {
    if (socket) socket.disconnect();

    console.log('🔗 Bağlanıyor:', socketUrl);
    socket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      withCredentials: false,
      auth: { token: token || undefined }
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setMyId(socket.id || null);
      // Token varsa reconnect dene
      if (token) {
        socket.emit('reconnect_to_game');
      }
    });
    socket.on('connect_error', (err) => console.error('❌ Connection', err));
    socket.on('disconnect', () => setIsConnected(false));

    // Auth bilgisi sunucudan gelir
    socket.on('auth_info', (info: { userId: string; isAdmin: boolean } | null) => {
      if (info) {
        setAuthIsAdmin(info.isAdmin);
        setAuthChecked(true);
      }
    });

    // Reconnect sonucu
    socket.on('reconnected', (data: { roomId: string }) => {
      console.log('🔄 Oyuna geri bağlanıldı:', data.roomId);
      toast.success('Oyuna geri bağlandınız! 🔄');
    });
    socket.on('no_active_game', () => {
      console.log('🔍 Aktif oyun bulunamadı');
    });

    socket.on('room_list_update', setRooms);

    socket.on('game_state_update', (gameState: GameState) => {
      setTiles(gameState.tiles);
      setPlayers(gameState.players);
      setGameStatus(gameState.status);
      setActivePlayerId(gameState.activePlayerId);
      setHostId(gameState.hostId);
      setBuildings(gameState.buildings);
      if (gameState.currentTradeOffer !== undefined) setCurrentOffer(gameState.currentTradeOffer);
      if (gameState.turnSubPhase) setTurnSubPhase(gameState.turnSubPhase);

      setWinnerId((gameState as any).winnerId || null);
      setLongestRoadPlayerId((gameState as any).longestRoadPlayerId || null);
      setLargestArmyPlayerId((gameState as any).largestArmyPlayerId || null);
      setActiveCartelPlayerId((gameState as any).activeCartelPlayerId || null);
      setStartRolls((gameState as any).startRolls || []);
      setFreeRoadsRemaining((gameState as any).freeRoadsRemaining || 0);
      setTraderPicksRemaining((gameState as any).traderPicksRemaining || 0);
      setDevCardDeckCount((gameState as any).devCardDeckCount || 0);
    });
    socket.on('dice_result', (data: { die1: number, die2: number, total: number }) => {
      setHasRolled(true);
      setHighlightNumber(data.total);
      setTimeout(() => setHighlightNumber(null), 3000);
      toast.info(`🎲 Zar: ${data.total} (${data.die1}+${data.die2})`, { autoClose: 3000, theme: "dark" });
    });

    socket.on('robber_victims', (data: { victims: string[] }) => {
      if (data.victims.length === 1) {
        socket.emit('rob_player', { victimId: data.victims[0] });
        setTurnSubPhase('waiting');
      } else {
        setPossibleVictims(data.victims);
      }
    });

    socket.on('join_success', () => setIsInGame(true));
    socket.on('error_message', (data: { message: string }) => toast.error(data.message));
    socket.on('system_alert', (data: { message: string }) => toast.info(data.message));
    socket.on('banned_from_room', (data: { message: string }) => {
      toast.error(data.message);
      setIsInGame(false);
      setGameStatus(GameStatus.LOBBY);
    });
    socket.on('room_closed', (data: { message: string }) => {
      toast.info(data.message);
      setIsInGame(false);
      setGameStatus(GameStatus.LOBBY);
      setActivePlayerId(null);
      setTiles([]);
      setBuildings([]);
      setPlayers([]);
    });
  }, []);

  // İlk yüklemede socket bağla
  useEffect(() => {
    if (authToken) {
      connectSocket(authToken);
    }
    return () => { if (socket) socket.disconnect(); };
  }, [authToken, connectSocket]);

  // Auth handler
  const handleAuth = (data: { token: string; userId: string; username: string; isAdmin: boolean }) => {
    setAuthToken(data.token);
    setAuthUserId(data.userId);
    setAuthUsername(data.username);
    setAuthIsAdmin(data.isAdmin);
    setAuthChecked(true);
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('cumor_token');
    localStorage.removeItem('cumor_userId');
    localStorage.removeItem('cumor_username');
    setAuthToken(null);
    setAuthUserId(null);
    setAuthUsername('');
    setAuthIsAdmin(false);
    setAuthChecked(false);
    setIsInGame(false);
    setShowProfile(false);
    if (socket) socket.disconnect();
  };

  // Ctrl+Alt+G: Admin panelini aç/kapa (admin ise)
  useEffect(() => {
    const handleAdminHotkey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (authIsAdmin) {
          setShowAdminPanel(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleAdminHotkey);
    return () => window.removeEventListener('keydown', handleAdminHotkey);
  }, [authIsAdmin]);


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
      // Enkaz kontrolü - piksel bazlı eşleştirme
      const HEX = 50;
      const { x, y } = hexToPixel(q, r, HEX);
      const corners = getHexCorners(x, y, HEX);
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 6];
      const clickMidX = (c1.x + c2.x) / 2;
      const clickMidY = (c1.y + c2.y) / 2;

      // Enkaz bul (piksel mesafesi ile)
      const debris = buildings.find(b => {
        if (b.type !== 'debris') return false;
        if (b.coord.edgeIndex === undefined || b.coord.edgeIndex < 0) return false;
        const { x: bx, y: by } = hexToPixel(b.coord.q, b.coord.r, HEX);
        const bc = getHexCorners(bx, by, HEX);
        const bc1 = bc[b.coord.edgeIndex];
        const bc2 = bc[(b.coord.edgeIndex + 1) % 6];
        const mx = (bc1.x + bc2.x) / 2;
        const my = (bc1.y + bc2.y) / 2;
        const dx = mx - clickMidX;
        const dy = my - clickMidY;
        return Math.sqrt(dx * dx + dy * dy) < 5;
      });

      if (debris) {
        // Orijinal koordinatları gönder
        socket.emit('repair_debris', { q: debris.coord.q, r: debris.coord.r, edgeIndex: debris.coord.edgeIndex });
        return;
      }

      // İnşaat Modu (veya free_road modu)
      if (turnSubPhase === 'road' || (turnSubPhase as any) === 'free_road') {
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

  // KART OYNAMA: Mercator için önce modal aç, diğerleri direkt oyna
  const handlePlayCard = (cardType: any) => {
    if (cardType === DevCardType.MERCATOR || cardType === 'Mercator') {
      setShowMercatorModal(true); // Mercator modali aç (kaynak seçimi için)
      return;
    }
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
  // ADMİN KONTROLÜ: Hesap bazlı admin kontrolü
  const myPlayer = players.find(p => p.id === myId);
  const isAdmin = authIsAdmin;

  // Auth ekranı: token yoksa giriş/kayıt göster
  if (!authToken) {
    return (
      <>
        <AuthScreen socketUrl={socketUrl} onAuth={handleAuth} />
        <ToastContainer position="top-center" />
      </>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0f172a] text-white flex flex-col overflow-hidden font-sans">
      <ToastContainer position="top-center" theme="dark" />
      <header className="h-14 bg-slate-800/95 border-b border-slate-600 flex items-center px-4 z-20 shrink-0 gap-3">
        {/* SOL: Logo + Durum */}
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-xl font-bold text-cyan-400 tracking-wider">CUMOR</h1>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          {isInGame && (
            <>
              <span className="text-gray-500 text-xs">|</span>
              <span className="text-gray-400 text-xs">{gameStatus}</span>
              {gameStatus === GameStatus.LOBBY && myId === hostId && players.length > 1 && (
                <button onClick={handleStartGame} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-bold ml-1">
                  BAŞLAT 🚀
                </button>
              )}
            </>
          )}
        </div>

        {/* ORTA: Oyuncu Skor Tablosu */}
        {isInGame && (
          <div className="flex-1 flex items-center justify-center gap-1.5 overflow-x-auto">
            {players.map(p => {
              const isActive = activePlayerId === p.id;
              const isMe = p.id === myId;
              const hasLongestRoad = longestRoadPlayerId === p.id;
              const hasLargestArmy = largestArmyPlayerId === p.id;
              return (
                <div key={p.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${isActive
                    ? 'bg-yellow-500/20 border border-yellow-400 text-white shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                    : 'bg-slate-700/40 border border-slate-600/50 text-gray-400'
                    } ${isMe ? 'ring-1 ring-cyan-500/50' : ''}`}
                  title={`${p.name} - ${p.victoryPoints} VP`}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="font-semibold truncate max-w-[60px]">{p.name}</span>
                  <span className="text-yellow-400 font-bold">{p.victoryPoints}</span>
                  {hasLongestRoad && <span title="En Uzun Yol (+2 VP)" className="text-[10px]">🛤️</span>}
                  {hasLargestArmy && <span title="En Güçlü Ordu (+2 VP)" className="text-[10px]">⚔️</span>}
                  {isActive && <span className="text-[9px] text-yellow-300 animate-pulse">●</span>}
                  {/* Ban butonu - host görür, kendisi hariç */}
                  {myId === hostId && !isMe && (
                    <button
                      onClick={() => { if (confirm(`${p.name} oyuncusunu odadan atmak istiyor musunuz?`)) socket.emit('ban_player', { targetId: p.id }); }}
                      className="text-red-500 hover:text-red-300 text-[10px] ml-0.5" title="Oyuncuyu At"
                    >
                      🚫
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SAĞ: Sıradaki + Admin */}
        {isInGame && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-700/50 px-2 py-1 rounded text-xs border border-slate-600">
              <span className="text-gray-500">Sıra:</span>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activePlayer?.color || 'gray' }} />
              <span className="font-semibold text-white">{activePlayer?.name || '...'}</span>
            </div>

            {/* Admin butonu + kilit göstergesi (Sadece panel AÇIKKEN görünür) */}
            {isAdmin && showAdminPanel && (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Admin Modu Aktif (Ctrl+Alt+G)" />
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="Admin Paneli (Ctrl+Alt+G ile aç/kapa)"
                >
                  ⚙️
                </button>
              </>
            )}

            {/* Odayı Kapat Butonu (Sadece Host) */}
            {myId === hostId && (
              <button
                onClick={() => { if (confirm("Odayı kapatmak istediğinize emin misiniz? Herkes lobiyie dönecek.")) socket.emit('close_room'); }}
                className="bg-red-900/80 hover:bg-red-800 text-white px-2 py-1 rounded text-xs border border-red-700 ml-2"
                title="Odayı Kapat"
              >
                🏁 Kapat
              </button>
            )}
          </div>
        )}
      </header>

      <main className={`flex-1 relative flex items-center justify-center bg-slate-900 ${isInGame ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {!isInGame && (
          <div className="z-10 w-full max-w-4xl px-4 flex flex-col items-center gap-4 py-4 md:py-0">
            {/* Profil Paneli */}
            <div className="w-full flex justify-end">
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="flex items-center gap-2 bg-slate-700/80 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs transition-colors border border-slate-600"
              >
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold">
                  {authUsername.charAt(0).toUpperCase()}
                </div>
                {authUsername}
                {authIsAdmin && <span className="text-red-400 text-[10px]">⭐</span>}
              </button>
            </div>
            {showProfile && (
              <ProfilePanel
                socketUrl={socketUrl}
                userId={authUserId!}
                username={authUsername}
                isAdmin={authIsAdmin}
                onLogout={handleLogout}
              />
            )}
            <Lobby rooms={rooms} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
          </div>
        )}
        {isInGame && (
          <>
            {/* BOARD - EN ALT KATMAN */}
            <div className="absolute inset-0 z-0 flex items-center justify-center">
              <HexBoard
                tiles={tiles}
                buildings={buildings}
                players={players}
                onVertexClick={handleVertexClick}
                onEdgeClick={handleEdgeClick}
                onTileClick={handleTileClick}
                highlightNumber={highlightNumber} // YENİ PROP
              />
            </div>

            {/* DURUM BİLGİLENDİRMESİ (SETUP & OYUN) */}
            {isInGame && !hasRolled && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                {gameStatus.includes('setup') && isMyTurn && (
                  <div className="bg-slate-900/80 text-white px-6 py-3 rounded-full border border-yellow-500 shadow-xl backdrop-blur text-xl font-bold animate-bounce">
                    {turnSubPhase === 'settlement' && "🏠 Bir Köy Yerleştir"}
                    {turnSubPhase === 'road' && "🛣️ Bir Yol Yerleştir"}
                  </div>
                )}
                {gameStatus.includes('setup') && !isMyTurn && (
                  <div className="bg-slate-900/60 text-gray-400 px-4 py-2 rounded-full border border-slate-700 backdrop-blur text-sm">
                    ⏳ {activePlayer?.name} yerleştirme yapıyor...
                  </div>
                )}
                {gameStatus === GameStatus.PLAYING && !isMyTurn && (
                  <div className="bg-slate-900/60 text-gray-400 px-4 py-2 rounded-full border border-slate-700 backdrop-blur text-sm">
                    ⏳ {activePlayer?.name} oynuyor...
                  </div>
                )}
              </div>
            )}

            {/* (Eski oyuncu listesi kaldırıldı - artık header'da gösteriliyor) */}

            {/* === BAŞLANGIÇ ZARI PANELİ (BASİT & ŞEFFAF) === */}
            {(gameStatus === GameStatus.ROLLING_FOR_START || gameStatus === 'rolling_for_start' as GameStatus) && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4">
                <div className="bg-slate-900/90 p-6 rounded-2xl border-2 border-cyan-500 shadow-2xl backdrop-blur-sm text-center min-w-[300px]">
                  <h2 className="text-xl font-bold text-cyan-400 mb-4 tracking-wider">🎲 Başlangıç Zarları</h2>

                  <div className="space-y-2 mb-6">
                    {players.map(p => {
                      const rollEntry = startRolls.find(r => r.playerId === p.id);
                      const rollVal = rollEntry?.roll;
                      return (
                        <div key={p.id} className="flex justify-between items-center bg-slate-800/50 px-3 py-2 rounded border border-slate-700">
                          <span className={`${activePlayerId === p.id ? 'text-white' : 'text-gray-400'}`}>{p.name}</span>
                          <span className="font-mono text-cyan-300 font-bold">{rollVal !== null ? rollVal : (activePlayerId === p.id ? '...' : '-')}</span>
                        </div>
                      );
                    })}
                  </div>

                  {activePlayerId === myId ? (
                    <button
                      onClick={() => socket.emit('roll_dice_start')}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-lg font-bold shadow-lg transition-transform active:scale-95"
                    >
                      ZAR AT
                    </button>
                  ) : (
                    <div className="text-gray-400 text-sm animate-pulse">
                      {players.find(p => p.id === activePlayerId)?.name} bekleniyor...
                    </div>
                  )}
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
              <div className="absolute right-119 bottom-10 z-50 pointer-events-none md:pointer-events-auto">
                 {/* PC DICE BUTTON (Hidden on Mobile) */}
                <button onClick={handleRollDice} className="hidden md:flex bg-red-600 hover:bg-red-500 text-white w-24 h-24 rounded-full font-black text-xl shadow-[0_0_30px_rgba(220,38,38,0.6)] border-4 border-slate-900 transition-transform active:scale-90 flex-col items-center justify-center gap-1">
                  <span>🎲</span><span>ZAR AT</span>
                </button>
              </div>
            )}

            {/* MOBILE DICE BUTTON (Hidden on Desktop) */}
            {isInGame && isMyTurn && gameStatus === GameStatus.PLAYING && !hasRolled && (
                 <button 
                  onClick={handleRollDice} 
                  className="md:hidden fixed bottom-40 left-1/2 -translate-x-1/2 bg-red-600 hover:bg-red-500 text-white w-20 h-20 rounded-full font-black text-lg shadow-[0_0_20px_rgba(220,38,38,0.8)] border-4 border-slate-900 z-50 flex flex-col items-center justify-center animate-bounce"
                 >
                  <span>🎲</span>
                  <span className="text-xs">ZAR AT</span>
                </button>
            )}

            {/* MOBILE END TURN BUTTON (Hidden on Desktop) */}
            {isInGame && isMyTurn && gameStatus === GameStatus.PLAYING && hasRolled && (
                 <button 
                  onClick={handleEndTurn} 
                  className="md:hidden fixed bottom-40 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white w-20 h-20 rounded-full font-black text-lg shadow-[0_0_20px_rgba(37,99,235,0.8)] border-4 border-slate-900 z-50 flex flex-col items-center justify-center animate-pulse"
                 >
                  <span>⏭️</span>
                  <span className="text-[10px]">BİTİR</span>
                </button>
            )}

            {/* DESKTOP PANELS (Hidden on Mobile via CSS) */}
            {isInGame && isMyTurn && gameStatus === GameStatus.PLAYING && hasRolled && (
              <ActionPanel
                onBuildRoad={startBuildRoad}
                onBuildSettlement={startBuildSettlement}
                onBuildCity={startBuildCity}
                onBuyCard={handleBuyCard}
                onEndTurn={handleEndTurn}
                isBuilding={turnSubPhase === 'road' || turnSubPhase === 'settlement' || turnSubPhase === 'city' ? turnSubPhase : null}
                onCancelBuild={cancelBuild}
                devCardDeckCount={devCardDeckCount}
              />
            )}

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
                tiles={tiles}
                onBuyVictoryPoint={() => socket.emit('buy_victory_point')}
                canBuyVP={(players.find(p => p.id === myId)?.resources?.[ResourceType.GOLD] || 0) >= 15}
                isMyTurn={isMyTurn}
              />
            )}

            {isInGame && activePlayer && myId && (
              <ResourcePanel
                resources={players.find(p => p.id === myId)?.resources || {} as any}
                devCards={players.find(p => p.id === myId)?.devCards || {} as any}
                onPlayCard={handlePlayCard}
                isMyTurn={isMyTurn}
              />
            )}

            {isInGame && myId && (
              <BuildCostPanel
                playerResources={players.find(p => p.id === myId)?.resources || {} as any}
                buildingCounts={{
                  settlements: buildings.filter(b => b.ownerId === myId && b.type === BuildingType.SETTLEMENT).length,
                  cities: buildings.filter(b => b.ownerId === myId && b.type === BuildingType.CITY).length,
                  roads: buildings.filter(b => b.ownerId === myId && b.type === BuildingType.ROAD).length,
                }}
              />
            )}

            {/* MOBILE PANELS (Conditional Render) */}
            {isInGame && isMyTurn && gameStatus === GameStatus.PLAYING && hasRolled && activeMobilePanel === 'actions' && (
              <MobileActionPanel
                onBuildRoad={startBuildRoad}
                onBuildSettlement={startBuildSettlement}
                onBuildCity={startBuildCity}
                onBuyCard={handleBuyCard}
                onEndTurn={handleEndTurn}
                isBuilding={turnSubPhase === 'road' || turnSubPhase === 'settlement' || turnSubPhase === 'city' ? turnSubPhase : null}
                onCancelBuild={cancelBuild}
                devCardDeckCount={devCardDeckCount}
              />
            )}

            {isInGame && gameStatus === GameStatus.PLAYING && activeMobilePanel === 'trade' && (
              <MobileTradePanel
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
                tiles={tiles}
                onBuyVictoryPoint={() => socket.emit('buy_victory_point')}
                canBuyVP={(players.find(p => p.id === myId)?.resources?.[ResourceType.GOLD] || 0) >= 15}
                isMyTurn={isMyTurn}
                onClose={() => setActiveMobilePanel('none')}
              />
            )}

            {isInGame && activePlayer && myId && (
              <MobileResourcePanel
                resources={players.find(p => p.id === myId)?.resources || {} as any}
                devCards={players.find(p => p.id === myId)?.devCards || {} as any}
                onPlayCard={handlePlayCard}
                isMyTurn={isMyTurn}
              />
            )}

            {isInGame && myId && activeMobilePanel === 'costs' && (
              <MobileBuildCostPanel
                playerResources={players.find(p => p.id === myId)?.resources || {} as any}
                buildingCounts={{
                  settlements: buildings.filter(b => b.ownerId === myId && b.type === BuildingType.SETTLEMENT).length,
                  cities: buildings.filter(b => b.ownerId === myId && b.type === BuildingType.CITY).length,
                  roads: buildings.filter(b => b.ownerId === myId && b.type === BuildingType.ROAD).length,
                }}
                onClose={() => setActiveMobilePanel('none')}
              />
            )}

            {isInGame && activePlayer && myId && activeMobilePanel === 'cards' && (
               <MobileDevCardPanel
                resources={players.find(p => p.id === myId)?.resources || {} as any}
                devCards={players.find(p => p.id === myId)?.devCards || {} as any}
                onPlayCard={handlePlayCard}
                isMyTurn={isMyTurn}
                onClose={() => setActiveMobilePanel('none')}
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



            {/* CHAT PANELİ */}
            <ChatPanel
              socket={socket}
              myId={myId || ''}
              players={players}
              isOpen={isChatOpen}
              onToggle={() => setIsChatOpen(!isChatOpen)}
            />

            {/* ÜCRETSIZ YOL BANNERI (Mühendis kartı) */}
            {isMyTurn && (turnSubPhase as any) === 'free_road' && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                <div className="bg-green-600 text-white px-6 py-4 rounded-full font-black shadow-2xl border-4 border-slate-900 text-xl flex items-center gap-2">
                  <span>🛣️</span> ÜCRETSIZ YOL KOY! (Kalan: {freeRoadsRemaining})
                </div>
              </div>
            )}

            {/* TÜCCAR MODALİ: Bankadan kaynak seç */}
            {isMyTurn && ((turnSubPhase as any) === 'trader_pick' || showTraderModal) && (
              <div className="absolute inset-0 bg-black/60 z-[70] flex items-center justify-center backdrop-blur-sm">
                <div className="bg-slate-800 p-8 rounded-2xl border-2 border-green-500 shadow-2xl text-center">
                  <h2 className="text-2xl font-black text-white mb-2">📦 Tüccar - Kaynak Seç</h2>
                  <p className="text-gray-400 mb-4">Kalan seçim: {traderPicksRemaining}</p>
                  <div className="grid grid-cols-5 gap-3">
                    {[ResourceType.LUMBER, ResourceType.CONCRETE, ResourceType.TEXTILE, ResourceType.FOOD, ResourceType.DIAMOND].map(res => (
                      <button
                        key={res}
                        onClick={() => {
                          socket.emit('trader_pick_resource', { resource: res });
                          setShowTraderModal(false);
                        }}
                        className="bg-slate-700 hover:bg-green-600 text-white p-4 rounded-xl font-bold transition-all border border-slate-600 hover:scale-105 flex flex-col items-center gap-1"
                        title={`${res} al`}
                      >
                        <span className="text-2xl">{res === ResourceType.LUMBER ? '🌲' : res === ResourceType.CONCRETE ? '🧱' : res === ResourceType.TEXTILE ? '🐑' : res === ResourceType.FOOD ? '🌾' : '💎'}</span>
                        <span className="text-xs">{res}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* MERCATOR MODALİ: Kaynak türü seç */}
            {showMercatorModal && (
              <div className="absolute inset-0 bg-black/60 z-[70] flex items-center justify-center backdrop-blur-sm">
                <div className="bg-slate-800 p-8 rounded-2xl border-2 border-purple-500 shadow-2xl text-center">
                  <h2 className="text-2xl font-black text-white mb-2">🌍 Mercator - Kaynak Talep Et</h2>
                  <p className="text-gray-400 mb-4">Her rakipten seçtiğin kaynaktan max 2 alırsın!</p>
                  <div className="grid grid-cols-5 gap-3">
                    {[ResourceType.LUMBER, ResourceType.CONCRETE, ResourceType.TEXTILE, ResourceType.FOOD, ResourceType.DIAMOND].map(res => (
                      <button
                        key={res}
                        onClick={() => {
                          socket.emit('play_card', { cardType: DevCardType.MERCATOR, targetResource: res });
                          setShowMercatorModal(false);
                        }}
                        className="bg-slate-700 hover:bg-purple-600 text-white p-4 rounded-xl font-bold transition-all border border-slate-600 hover:scale-105 flex flex-col items-center gap-1"
                        title={`${res} talep et`}
                      >
                        <span className="text-2xl">{res === ResourceType.LUMBER ? '🌲' : res === ResourceType.CONCRETE ? '🧱' : res === ResourceType.TEXTILE ? '🐑' : res === ResourceType.FOOD ? '🌾' : '💎'}</span>
                        <span className="text-xs">{res}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowMercatorModal(false)} className="mt-4 text-gray-400 hover:text-white text-sm">İptal</button>
                </div>
              </div>
            )}

            {/* ADMİN PANELİ: Hesap bazlı admin */}
            {showAdminPanel && isAdmin && (
              <div className="absolute top-16 right-4 z-[80] bg-slate-800/95 p-5 rounded-xl border-2 border-red-500 shadow-2xl w-96 backdrop-blur-sm max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-red-400">⚙️ Admin Paneli</h3>
                  <button onClick={() => setShowAdminPanel(false)} className="text-gray-400 hover:text-white text-lg">✕</button>
                </div>

                {/* DESTE BİLGİSİ */}
                <div className="bg-slate-700/50 p-3 rounded-lg mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-300">🃏 Destede Kalan Kart:</span>
                  <span className="text-lg font-bold text-yellow-400">{devCardDeckCount} / 30</span>
                </div>

                {/* KAYNAK MİKTARI AYARI */}
                <div className="bg-slate-700/50 p-3 rounded-lg mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">Verilecek miktar:</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setAdminResourceAmount(Math.max(1, adminResourceAmount - 1))} className="bg-slate-600 hover:bg-slate-500 text-white w-6 h-6 rounded text-sm font-bold">-</button>
                      <span className="text-yellow-400 font-bold text-lg w-8 text-center">{adminResourceAmount}</span>
                      <button onClick={() => setAdminResourceAmount(adminResourceAmount + 1)} className="bg-slate-600 hover:bg-slate-500 text-white w-6 h-6 rounded text-sm font-bold">+</button>
                    </div>
                  </div>
                </div>

                {/* OYUNCU LİSTESİ */}
                {players.map(p => {
                  const totalCards = p.devCards ? Object.values(p.devCards).reduce((s: number, v: number) => s + v, 0) : 0;
                  return (
                    <div key={p.id} className="mb-3 bg-slate-700/50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="font-bold text-sm flex-1">{p.name}</span>
                        <span className="text-xs text-gray-400">{p.victoryPoints} VP</span>
                        <span className="text-xs text-purple-400" title="Toplam gelişim kartı">🃏{totalCards}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[ResourceType.LUMBER, ResourceType.CONCRETE, ResourceType.TEXTILE, ResourceType.FOOD, ResourceType.DIAMOND, ResourceType.GOLD].map(res => (
                          <div key={res} className="flex flex-col gap-0.5">
                            <button
                              onClick={() => {
                                const r: any = {}; r[res] = adminResourceAmount;
                                socket.emit('admin_give_resources', { targetId: p.id, resources: r });
                              }}
                              className="bg-slate-600 hover:bg-green-600 text-white px-1.5 py-1 rounded text-[10px] transition-colors"
                              title={`${res} +${adminResourceAmount} ver`}
                            >
                              {res === ResourceType.LUMBER ? '🌲' : res === ResourceType.CONCRETE ? '🧱' : res === ResourceType.TEXTILE ? '🐑' : res === ResourceType.FOOD ? '🌾' : res === ResourceType.DIAMOND ? '💎' : '🪙'}
                              +{adminResourceAmount}
                            </button>
                            <button
                              onClick={() => {
                                const r: any = {}; r[res] = -adminResourceAmount;
                                socket.emit('admin_give_resources', { targetId: p.id, resources: r });
                              }}
                              className="bg-slate-600 hover:bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] transition-colors"
                              title={`${res} -${adminResourceAmount} sil`}
                            >
                              -{adminResourceAmount}
                            </button>
                          </div>
                        ))}
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => {
                              const r: any = {};
                              r[ResourceType.LUMBER] = adminResourceAmount; r[ResourceType.CONCRETE] = adminResourceAmount;
                              r[ResourceType.TEXTILE] = adminResourceAmount; r[ResourceType.FOOD] = adminResourceAmount;
                              r[ResourceType.DIAMOND] = adminResourceAmount; r[ResourceType.GOLD] = adminResourceAmount;
                              socket.emit('admin_give_resources', { targetId: p.id, resources: r });
                            }}
                            className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold"
                            title={`Tüm kaynaklar +${adminResourceAmount}`}
                          >
                            HEPSİ +
                          </button>
                          <button
                            onClick={() => {
                              const r: any = {};
                              r[ResourceType.LUMBER] = -adminResourceAmount; r[ResourceType.CONCRETE] = -adminResourceAmount;
                              r[ResourceType.TEXTILE] = -adminResourceAmount; r[ResourceType.FOOD] = -adminResourceAmount;
                              r[ResourceType.DIAMOND] = -adminResourceAmount; r[ResourceType.GOLD] = -adminResourceAmount;
                              socket.emit('admin_give_resources', { targetId: p.id, resources: r });
                            }}
                            className="bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold"
                            title={`Tüm kaynaklar -${adminResourceAmount}`}
                          >
                            HEPSİ -
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            const vp = prompt(`${p.name} için VP değeri:`, String(p.victoryPoints));
                            if (vp !== null) socket.emit('admin_set_vp', { targetId: p.id, vp: parseInt(vp) || 0 });
                          }}
                          className="bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-1 rounded text-[10px] font-bold"
                          title="VP ayarla"
                        >
                          VP
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </>
        )}

        {/* MOBILE NAVBAR - Sadece mobilde ve oyunda görünür */}
        {isInGame && (
          <div className="md:hidden fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 flex justify-around items-center h-16 z-[60] pb-2 safe-area-bottom">
            <button onClick={() => {
              setActiveMobilePanel(activeMobilePanel === 'trade' ? 'none' : 'trade');
              setIsChatOpen(false); 
            }} className={`flex flex-col items-center p-2 transition-colors ${activeMobilePanel === 'trade' ? 'text-blue-400' : 'text-gray-400'}`}>
              <span className="text-2xl">⚖️</span>
              <span className="text-[10px] font-bold">Takas</span>
            </button>
            <button onClick={() => {
              setActiveMobilePanel(activeMobilePanel === 'actions' ? 'none' : 'actions');
              setIsChatOpen(false);
            }} className={`flex flex-col items-center p-2 transition-colors ${activeMobilePanel === 'actions' ? 'text-blue-400' : 'text-gray-400'}`}>
              <span className="text-2xl">🔨</span>
              <span className="text-[10px] font-bold">İnşaat</span>
            </button>
            <button onClick={() => {
               setActiveMobilePanel(activeMobilePanel === 'cards' ? 'none' : 'cards');
               setIsChatOpen(false);
            }} className={`flex flex-col items-center p-2 transition-colors ${activeMobilePanel === 'cards' ? 'text-blue-400' : 'text-gray-400'}`}>
              <span className="text-2xl">🃏</span>
              <span className="text-[10px] font-bold">Kartlar</span>
            </button>
            <button onClick={() => {
              setActiveMobilePanel(activeMobilePanel === 'costs' ? 'none' : 'costs');
              setIsChatOpen(false);
            }} className={`flex flex-col items-center p-2 transition-colors ${activeMobilePanel === 'costs' ? 'text-blue-400' : 'text-gray-400'}`}>
              <span className="text-2xl">📋</span>
              <span className="text-[10px] font-bold">Maliyet</span>
            </button>
            <button onClick={() => {
              setIsChatOpen(!isChatOpen);
              if (!isChatOpen) setActiveMobilePanel('none');
            }} className={`flex flex-col items-center p-2 transition-colors ${isChatOpen ? 'text-blue-400' : 'text-gray-400'}`}>
              <span className="text-2xl">💬</span>
              <span className="text-[10px] font-bold">Sohbet</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
export default App;