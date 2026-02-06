import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './game/RoomManager.js';
const app = express();
app.set('trust proxy', 1); // Railway proxy desteği (önemli)
app.use(cors());
console.log('🏁 Server process starting...');
console.log('📝 ENV PORT value:', process.env.PORT);
app.get('/', (req, res) => {
    res.send('Server is running! 🚀');
});
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
    }
});
const rooms = new Map();
const playerRoomMap = new Map();
io.on('connection', (socket) => {
    console.log(`🔌 Yeni bağlantı: ${socket.id}`);
    socket.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
    socket.on('create_room', (data) => {
        try {
            const roomId = Math.random().toString(36).substr(2, 9);
            const newRoom = new RoomManager(roomId, data.roomName, data.password);
            newRoom.addPlayer(socket.id, data.playerName, data.playerColor);
            rooms.set(roomId, newRoom);
            playerRoomMap.set(socket.id, roomId);
            socket.join(roomId);
            socket.emit('join_success');
            io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
            io.to(roomId).emit('game_state_update', newRoom.getGameState());
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('join_room', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room)
                throw new Error("Oda bulunamadı!");
            if (room.password && room.password !== data.password)
                throw new Error("Yanlış şifre!");
            room.addPlayer(socket.id, data.playerName, data.playerColor);
            playerRoomMap.set(socket.id, data.roomId);
            socket.join(data.roomId);
            socket.emit('join_success');
            io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
            io.to(data.roomId).emit('game_state_update', room.getGameState());
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('start_game', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                const message = room.startGame(socket.id);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
                io.to(room.getRoomInfo().id).emit('system_alert', { message });
                io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('build_settlement', (coords) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.buildSettlement(socket.id, coords);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    // YENİ: ŞEHİR KURMA LISTENER
    socket.on('upgrade_to_city', (coords) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.upgradeSettlement(socket.id, coords);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    // 1. Hırsız Taşıma İsteği
    socket.on('move_robber', (coords) => {
        try {
            const roomId = playerRoomMap.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (room) {
                // Hırsızı taşı ve potansiyel kurbanları al
                const victims = room.moveRobber(socket.id, coords);
                io.to(roomId).emit('game_state_update', room.getGameState());
                // Kurban yoksa işlemi bitir
                if (victims.length === 0) {
                    io.to(roomId).emit('system_alert', { message: "Vergi Memuru yerleşti ama ceza kesecek kimse yok." });
                    // Tur fazını düzeltmek için backend'de küçük bir method gerekebilir ama şimdilik client yönetir
                }
                else {
                    // Odaya değil, SADECE zarı atan kişiye kurban listesini gönder
                    socket.emit('robber_victims', { victims });
                }
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    // 2. Kurban Seçimi ve Soygun
    socket.on('rob_player', (data) => {
        try {
            const roomId = playerRoomMap.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (room) {
                const result = room.robPlayer(socket.id, data.victimId);
                io.to(roomId).emit('game_state_update', room.getGameState());
                // ÖZEL BİLDİRİMLER
                // 1. Hırsıza ne çaldığını söyle
                socket.emit('system_alert', { message: `Başarılı! ${result.victimName}'den ${result.stolenMessage} el koydun.` });
                // 2. Kurbana neyinin gittiğini söyle (Private Message)
                // Bunu yapmak için kurbanın socket id'sini bulmamız lazım ama şimdilik basitçe broadcast yapalım ya da:
                // io.to(victimSocketId).emit(...) (Bunun için player map lazım, şimdilik genel log atalım)
                // 3. Herkese olay özeti
                socket.broadcast.to(roomId).emit('system_alert', { message: `${result.thiefName}, Vergi Memuru ile ${result.victimName} oyuncusuna ${result.stolenMessage} ceza kesti!` });
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('buy_card', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.buyDevelopmentCard(socket.id);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
                socket.emit('system_alert', { message: "Gelişim Kartı satın alındı! 🃏" });
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('play_card', (data) => {
        try {
            const roomId = playerRoomMap.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (room) {
                const message = room.playDevelopmentCard(socket.id, data.cardType);
                io.to(roomId).emit('game_state_update', room.getGameState());
                // İşlem başarılıysa bildirim gönder
                if (message) {
                    socket.emit('system_alert', { message }); // Oynayana
                    socket.broadcast.to(roomId).emit('system_alert', { message: "Bir oyuncu Gelişim Kartı oynadı!" });
                }
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('sabotage_road', (coords) => {
        try {
            const roomId = playerRoomMap.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (room) {
                room.sabotageRoad(socket.id, coords);
                io.to(roomId).emit('game_state_update', room.getGameState());
                io.to(roomId).emit('system_alert', { message: "BİR YOL SABOTE EDİLDİ! 🚧🔥" });
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    // ENKAZ TAMİR
    socket.on('repair_debris', (coords) => {
        try {
            const roomId = playerRoomMap.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (room) {
                room.repairDebris(socket.id, coords);
                io.to(roomId).emit('game_state_update', room.getGameState());
                io.to(roomId).emit('system_alert', { message: "Enkaz temizlendi ve yol yeniden inşa edildi! 🔧" });
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('build_road', (coords) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.buildRoad(socket.id, coords);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('roll_dice', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                const result = room.rollDice(socket.id);
                io.to(room.getRoomInfo().id).emit('dice_result', result);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('end_turn', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.endTurn(socket.id);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    // --- TİCARET HANDLERS (YENİ) ---
    socket.on('trade_with_bank', (data) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.tradeWithBank(socket.id, data.resource);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('buy_black_market', (data) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.buyFromBlackMarket(socket.id, data.resource);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('disconnect', () => {
        const roomId = playerRoomMap.get(socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.removePlayer(socket.id);
                if (room.isEmpty())
                    rooms.delete(roomId);
                else {
                    io.to(roomId).emit('game_state_update', room.getGameState());
                    io.to(roomId).emit('system_alert', { message: "Bir oyuncu ayrıldı." });
                }
                io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
            }
            playerRoomMap.delete(socket.id);
        }
    });
    socket.on('create_p2p_offer', (data) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.createP2PTrade(socket.id, data.give, data.want);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('accept_p2p_offer', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.acceptP2PTrade(socket.id);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('finalize_p2p_offer', (data) => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.finalizeP2PTrade(socket.id, data.partnerId);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
                socket.emit('system_alert', { message: "Ticaret tamamlandı! 🤝" });
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('cancel_p2p_offer', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                room.cancelP2PTrade(socket.id);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
    socket.on('roll_dice_start', () => {
        try {
            const room = rooms.get(playerRoomMap.get(socket.id));
            if (room) {
                const message = room.rollStartDice(socket.id);
                io.to(room.getRoomInfo().id).emit('game_state_update', room.getGameState());
                io.to(room.getRoomInfo().id).emit('system_alert', { message });
                io.emit('room_list_update', Array.from(rooms.values()).map(r => r.getRoomInfo()));
            }
        }
        catch (e) {
            socket.emit('error_message', { message: e.message });
        }
    });
});
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
// @ts-ignore
httpServer.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server 0.0.0.0:${PORT} adresinde çalışıyor!`));
