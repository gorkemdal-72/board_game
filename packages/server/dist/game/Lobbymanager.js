// packages/server/src/game/LobbyManager.ts
import { RoomManager } from './RoomManager.js';
export class LobbyManager {
    constructor() {
        this.rooms = new Map();
    }
    createRoom(name, password) {
        const id = Math.random().toString(36).substring(7); // Basit ID (örn: "x7z9a")
        const newRoom = new RoomManager(id, name, password);
        this.rooms.set(id, newRoom);
        console.log(`🏠 Yeni Oda Kuruldu: ${name} (${id})`);
        return newRoom;
    }
    getRoom(id) {
        return this.rooms.get(id);
    }
    // Tüm odaların listesini ver
    getRoomList() {
        return Array.from(this.rooms.values()).map(room => room.getRoomInfo());
    }
    removeRoom(id) {
        this.rooms.delete(id);
        console.log(`🗑️ Oda Silindi: ${id}`);
    }
}
