import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './game/RoomManager.js';
import { PlayerColor, GameStatus } from '@cumor/shared';
import { AuthManager } from './auth/AuthManager.js';
import { HistoryManager } from './auth/HistoryManager.js';

// Firebase başlat (import sırası önemli — ilk bu çalışmalı)
import './firebase.js';

const app = express();
app.set('trust proxy', 1); // Railway proxy desteği (önemli)
app.use(cors());
app.use(express.json()); // REST body parsing

console.log('🏁 Server process starting...');
console.log('📝 ENV PORT value:', process.env.PORT);

const authManager = new AuthManager();
const historyManager = new HistoryManager();

app.get('/', (req, res) => {
  res.send('Server is running! 🚀');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ======== REST API: HESAP SİSTEMİ ========

// KAYIT
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authManager.register(username, password);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// GİRİŞ
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authManager.login(username, password);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// PROFİL
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const profile = await authManager.getUserProfile(req.params.userId);
    if (!profile) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    res.json({ success: true, profile });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// OYUN GEÇMİŞİ
app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await historyManager.getUserHistory(req.params.userId);
    res.json({ success: true, history });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ADMİN YAP/KALDIR
app.post('/api/set-admin', async (req, res) => {
  try {
    const { token, targetUserId, makeAdmin } = req.body;
    const auth = await authManager.verifyToken(token);
    if (!auth) return res.status(401).json({ success: false, message: 'Geçersiz token' });
    const msg = await authManager.setAdmin(auth.userId, targetUserId, makeAdmin);
    res.json({ success: true, message: msg });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// KULLANICI ARA (admin paneli için)
app.get('/api/search-users', async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    const users = await authManager.searchUsers(query);
    res.json({ success: true, users });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ======== SOCKET.IO ========

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
  }
});

const rooms = new Map<string, RoomManager>();
const playerRoomMap = new Map<string, string>(); // socketId -> roomId
const userSocketMap = new Map<string, string>();  // userId -> socketId
const socketUserMap = new Map<string, { userId: string; isAdmin: boolean }>(); // socketId -> user info

// Disconnect timeout'ları (5 dk sonra oyundan kaldır)
const disconnectTimers = new Map<string, NodeJS.Timeout>(); // userId -> timer

io.on('connection', async (socket) => {
  console.log(`🔌 Yeni bağlantı: ${socket.id}`);

  // Token ile kullanıcı doğrulama
  const token = socket.handshake.auth?.token as string;
  let authInfo: { userId: string; isAdmin: boolean } | null = null;

  if (token) {
    try {
      authInfo = await authManager.verifyToken(token);
      if (authInfo) {
        userSocketMap.set(authInfo.userId, socket.id);
        socketUserMap.set(socket.id, authInfo);
        console.log(`✅ Auth: ${authInfo.userId} (admin: ${authInfo.isAdmin})`);

        // Reconnect timer varsa iptal et
        const timer = disconnectTimers.get(authInfo.userId);
        if (timer) {
          clearTimeout(timer);
          disconnectTimers.delete(authInfo.userId);
          console.log(`⏱️ Disconnect timer iptal: ${authInfo.userId}`);
        }
      }
    } catch (e) {
      console.error('Auth error:', e);
    }
  }

  // Auth bilgisini client'a gönder
  socket.emit('auth_info', authInfo ? { userId: authInfo.userId, isAdmin: authInfo.isAdmin } : null);
  socket.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));

  // RECONNECT: Sayfa yenileme sonrası eski oyuna geri bağlan
  socket.on('reconnect_to_game', async () => {
    if (!authInfo) return socket.emit('error_message', { message: 'Giriş yapmalısınız!' });

    // userId ile aktif oda bul
    for (const [roomId, room] of rooms) {
      const player = room.findPlayerByUserId(authInfo.userId);
      if (player) {
        // Eski socket'ten yeni socket'e geç
        const reconnected = room.reconnectPlayer(authInfo.userId, socket.id);
        if (reconnected) {
          playerRoomMap.set(socket.id, roomId);
          socket.join(roomId);
          socket.emit('join_success');
          socket.emit('reconnected', { roomId });
          io.to(roomId).emit('game_state_update', room.getGameState());
          io.to(roomId).emit('system_alert', { message: `${player.name} geri bağlandı! 🔄` });
          console.log(`🔄 Reconnect başarılı: ${player.name} → oda ${roomId}`);
          return;
        }
      }
    }
    // Oyun bulunamadıysa bildir
    socket.emit('no_active_game');
  });

  socket.on('create_room', (data) => {
    try {
      const roomId = Math.random().toString(36).substr(2, 9);
      const newRoom = new RoomManager(roomId, data.roomName, data.password);
      newRoom.addPlayer(socket.id, data.playerName, data.playerColor, authInfo?.userId);
      rooms.set(roomId, newRoom);
      playerRoomMap.set(socket.id, roomId);
      socket.join(roomId);
      socket.emit('join_success');
      io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
      io.to(roomId).emit('game_state_update', newRoom.getGameState());
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('join_room', (data) => {
    try {
      const room = rooms.get(data.roomId);
      if (!room) throw new Error("Oda bulunamadı!");
      if (room.isBanned(socket.id)) throw new Error("Bu odadan atıldınız!");

      // RECONNECT KONTROLÜ: Kullanıcı zaten odada mı? (authInfo.userId ile kontrol)
      if (authInfo && authInfo.userId) {
        const existingPlayer = room.findPlayerByUserId(authInfo.userId);
        if (existingPlayer) {
          // Evet, kullanıcı zaten var -> Reconnect yap
          const reconnected = room.reconnectPlayer(authInfo.userId, socket.id);
          if (reconnected) {
            playerRoomMap.set(socket.id, data.roomId);
            socket.join(data.roomId);
            socket.emit('join_success');
            socket.emit('reconnected', { roomId: data.roomId });
            io.to(data.roomId).emit('game_state_update', room.getGameState());
            io.to(data.roomId).emit('system_alert', { message: `${existingPlayer.name} geri bağlandı! 🔄` });
            return; // Normal join işlemini atla
          }
        }
      }

      if (room.password && room.password !== data.password) throw new Error("Yanlış şifre!");

      // Normal Join
      room.addPlayer(socket.id, data.playerName, data.playerColor, authInfo?.userId);
      playerRoomMap.set(socket.id, data.roomId);
      socket.join(data.roomId);
      socket.emit('join_success');
      io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
      io.to(data.roomId).emit('game_state_update', room.getGameState());
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // ODAYI KAPAT (Sadece Host)
  socket.on('close_room', () => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        if (room.getGameState().hostId !== socket.id) throw new Error("Sadece oda sahibi odayı kapatabilir!");

        // Odadaki herkese bildir ve lobiye at
        io.to(roomId).emit('room_closed', { message: "Oda sahibi odayı kapattı." });
        io.to(roomId).emit('game_state_update', { ...room.getGameState(), status: GameStatus.LOBBY }); // Garanti olsun

        // Socket odalarından çıkar (istemci tarafı da sayfayı yenilemeli veya lobiye dönmeli)
        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom) {
          for (const sId of socketsInRoom) {
            const s = io.sockets.sockets.get(sId);
            if (s) {
              s.leave(roomId);
              playerRoomMap.delete(sId);
            }
          }
        }

        rooms.delete(roomId);
        io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
        console.log(`🗑️ Oda kapatıldı: ${roomId}`);
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('start_game', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        const message = room.startGame(socket.id);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
        io.to(room.getRoomInfo().id).emit('system_alert', { message });
        io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('build_settlement', (coords: { q: number, r: number, vertexIndex: number }) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) { room.buildSettlement(socket.id, coords); io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState()); }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // YENİ: ŞEHİR KURMA LISTENER
  socket.on('upgrade_to_city', (coords: { q: number, r: number, vertexIndex: number }) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        room.upgradeSettlement(socket.id, coords);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  // 1. Hırsız Taşıma İsteği
  socket.on('move_robber', (coords: { q: number, r: number }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const victims = room.moveRobber(socket.id, coords);
        io.to(roomId).emit('game_state_update', room.getGameState());
        if (victims.length === 0) {
          io.to(roomId).emit('system_alert', { message: "Vergi Memuru yerleşti ama ceza kesecek kimse yok." });
        } else {
          socket.emit('robber_victims', { victims });
        }
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  // 2. Kurban Seçimi ve Soygun
  socket.on('rob_player', (data: { victimId: string }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const result = room.robPlayer(socket.id, data.victimId);
        io.to(roomId).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: `Başarılı! ${result.victimName}'den ${result.stolenMessage} el koydun.` });
        socket.broadcast.to(roomId).emit('system_alert', { message: `${result.thiefName}, Vergi Memuru ile ${result.victimName} oyuncusuna ${result.stolenMessage} ceza kesti!` });
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  socket.on('buy_card', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        room.buyDevelopmentCard(socket.id);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: "Gelişim Kartı satın alındı! 🃏" });
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  // KART OYNAMA
  socket.on('play_card', (data: { cardType: any, targetResource?: any }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const message = room.playDevelopmentCard(socket.id, data.cardType, data.targetResource);
        io.to(roomId).emit('game_state_update', room.getGameState());
        if (message) {
          socket.emit('system_alert', { message });
          socket.broadcast.to(roomId).emit('system_alert', { message: "Bir oyuncu Gelişim Kartı oynadı!" });
        }
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  socket.on('sabotage_road', (coords: { q: number, r: number, edgeIndex: number }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        room.sabotageRoad(socket.id, coords);
        io.to(roomId).emit('game_state_update', room.getGameState());
        io.to(roomId).emit('system_alert', { message: "BİR YOL SABOTE EDİLDİ! 🚧🔥" });
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  // ENKAZ TAMİR
  socket.on('repair_debris', (coords: { q: number, r: number, edgeIndex: number }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        room.repairDebris(socket.id, coords);
        io.to(roomId).emit('game_state_update', room.getGameState());
        io.to(roomId).emit('system_alert', { message: "Enkaz temizlendi ve yol yeniden inşa edildi! 🔧" });
      }
    } catch (e: any) {
      socket.emit('error_message', { message: e.message });
    }
  });

  socket.on('build_road', (coords) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) { room.buildRoad(socket.id, coords); io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState()); }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('roll_dice', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        const result = room.rollDice(socket.id);
        io.to(room.getRoomInfo().id).emit('dice_result', result);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('end_turn', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) { room.endTurn(socket.id); io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState()); }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // --- TİCARET HANDLERS ---
  socket.on('trade_with_bank', (data) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) { room.tradeWithBank(socket.id, data.resource); io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState()); }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('buy_black_market', (data) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        const msg = room.buyFromBlackMarket(socket.id, data.resource);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: msg });
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('buy_victory_point', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        const msg = room.buyVictoryPoint(socket.id);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
        io.to(room.getRoomInfo().id).emit('system_alert', { message: msg });
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // DISCONNECT: Oyundan atma yerine "disconnected" işaretle
  socket.on('disconnect', () => {
    const roomId = playerRoomMap.get(socket.id);
    const userInfo = socketUserMap.get(socket.id);

    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const wasRemoved = room.disconnectPlayer(socket.id);

        if (wasRemoved) {
          // Lobide: normal sil
          if (room.isEmpty()) rooms.delete(roomId);
          else {
            io.to(roomId).emit('game_state_update', room.getGameState());
            io.to(roomId).emit('system_alert', { message: "Bir oyuncu ayrıldı." });
          }
        } else {
          // Oyunda: 5 dk sonra kaldır
          io.to(roomId).emit('game_state_update', room.getGameState());
          io.to(roomId).emit('system_alert', { message: "Bir oyuncunun bağlantısı koptu. 5 dk içinde dönmezse atılacak. ⏱️" });

          if (userInfo) {
            const timer = setTimeout(() => {
              // 5 dk doldu, hâlâ dönmediyse sil
              const currentRoom = rooms.get(roomId);
              if (currentRoom) {
                // userId ile oyuncuyu bul
                const player = currentRoom.findPlayerByUserId(userInfo.userId);
                if (player && (player as any).disconnected) {
                  currentRoom.removePlayer(player.id);
                  if (currentRoom.isEmpty()) rooms.delete(roomId);
                  else {
                    io.to(roomId).emit('game_state_update', currentRoom.getGameState());
                    io.to(roomId).emit('system_alert', { message: `${player.name} bağlantı zaman aşımı nedeniyle oyundan çıkarıldı.` });
                  }
                  io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
                }
              }
              disconnectTimers.delete(userInfo.userId);
            }, 5 * 60 * 1000); // 5 dakika

            disconnectTimers.set(userInfo.userId, timer);
          }
        }
        io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
      }
      playerRoomMap.delete(socket.id);
    }

    // Cleanup socket maps
    if (userInfo) {
      socketUserMap.delete(socket.id);
      // userSocketMap'ten silme — reconnect için userId mapping'i kalmalı
    }
  });

  socket.on('create_p2p_offer', (data) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        room.createP2PTrade(socket.id, data.give, data.want);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('accept_p2p_offer', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        room.acceptP2PTrade(socket.id);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('finalize_p2p_offer', (data) => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        room.finalizeP2PTrade(socket.id, data.partnerId);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: "Ticaret tamamlandı! 🤝" });
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('cancel_p2p_offer', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        room.cancelP2PTrade(socket.id);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  socket.on('roll_dice_start', () => {
    try {
      const room = rooms.get(playerRoomMap.get(socket.id)!);
      if (room) {
        const message = room.rollStartDice(socket.id);
        io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
        io.to(room.getRoomInfo().id).emit('system_alert', { message });
        io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // CHAT SİSTEMİ
  socket.on('send_chat_message', (data: { text: string }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const player = room.getGameState().players.find(p => p.id === socket.id);
        if (player) {
          io.to(roomId).emit('chat_message', {
            senderId: player.id,
            senderName: player.name,
            text: data.text,
            color: player.color,
            timestamp: Date.now()
          });
        }
      }
    } catch (e) { console.error("Chat error", e); }
  });

  // BAN SİSTEMİ
  socket.on('ban_player', (data: { targetId: string }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const bannedName = room.banPlayer(socket.id, data.targetId);
        io.to(data.targetId).emit('banned_from_room', { message: `Oda sahibi sizi odadan attı!` });
        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
          targetSocket.leave(roomId);
        }
        playerRoomMap.delete(data.targetId);
        io.to(roomId).emit('game_state_update', room.getGameState());
        io.to(roomId).emit('system_alert', { message: `${bannedName} odadan atıldı! 🚫` });
        io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // TÜCCAR KARTI: Bankadan kaynak seçme
  socket.on('trader_pick_resource', (data: { resource: any }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const msg = room.traderPickResource(socket.id, data.resource);
        io.to(roomId).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: msg });
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // ADMİN: Kaynak ekleme/silme — artık hesap bazlı admin kontrolü
  socket.on('admin_give_resources', (data: { targetId: string, resources: any }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        // Admin yetkisi: hesap bazlı VEYA eski host kontrolü
        const userInfo = socketUserMap.get(socket.id);
        const isAccountAdmin = userInfo?.isAdmin || false;
        const isHost = room.getGameState().hostId === socket.id;
        if (!isAccountAdmin && !isHost) throw new Error("Admin yetkisi gerekli!");

        const msg = room.adminGiveResources(socket.id, data.targetId, data.resources);
        io.to(roomId).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: msg });
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });

  // ADMİN: VP ayarlama
  socket.on('admin_set_vp', (data: { targetId: string, vp: number }) => {
    try {
      const roomId = playerRoomMap.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (room) {
        const userInfo = socketUserMap.get(socket.id);
        const isAccountAdmin = userInfo?.isAdmin || false;
        const isHost = room.getGameState().hostId === socket.id;
        if (!isAccountAdmin && !isHost) throw new Error("Admin yetkisi gerekli!");

        const msg = room.adminSetVP(socket.id, data.targetId, data.vp);
        io.to(roomId).emit('game_state_update', room.getGameState());
        socket.emit('system_alert', { message: msg });
      }
    } catch (e: any) { socket.emit('error_message', { message: e.message }); }
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
// @ts-ignore
httpServer.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server 0.0.0.0:${PORT} adresinde çalışıyor!`));