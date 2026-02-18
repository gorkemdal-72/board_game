import { db } from '../firebase.js';
import { v4 as uuidv4 } from 'uuid';

export interface GameHistoryPlayer {
    userId: string;
    username: string;
    color: string;
    vp: number;
    isWinner: boolean;
}

export interface GameHistoryEntry {
    id: string;
    roomName: string;
    date: number;
    players: GameHistoryPlayer[];
    winnerId: string;
    winnerName: string;
}

export class HistoryManager {
    private historyCol = db.collection('gameHistory');

    // OYUN SONUCU KAYDET
    async saveGameResult(
        roomName: string,
        players: GameHistoryPlayer[],
        winnerId: string,
        winnerName: string
    ): Promise<void> {
        const id = uuidv4();
        await this.historyCol.doc(id).set({
            id,
            roomName,
            date: Date.now(),
            players,
            winnerId,
            winnerName
        });
        console.log(`📜 Oyun geçmişi kaydedildi: ${winnerName} kazandı!`);
    }

    // KULLANICININ OYUN GEÇMİŞİ (son 20)
    async getUserHistory(userId: string): Promise<GameHistoryEntry[]> {
        // Firestore'da array-contains ile oyuncunun userId'sini arıyoruz
        // Ama Firestore nested array query desteklemez, bu yüzden farklı yaklaşım:
        // Tüm geçmişi çekip filtreliyoruz (küçük ölçekli oyun için OK)
        const snapshot = await this.historyCol
            .orderBy('date', 'desc')
            .limit(100)
            .get();

        const results: GameHistoryEntry[] = [];
        for (const doc of snapshot.docs) {
            const data = doc.data() as GameHistoryEntry;
            if (data.players.some(p => p.userId === userId)) {
                results.push(data);
                if (results.length >= 20) break;
            }
        }
        return results;
    }
}
