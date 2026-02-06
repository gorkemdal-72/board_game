import { GameStatus, TerrainType, ResourceType, BuildingType, DevCardType } from '@cumor/shared';
import { hexToPixel, getHexCorners } from '@cumor/shared';
const HEX_SIZE = 50;
const BUILDING_COSTS = {
    [BuildingType.ROAD]: { [ResourceType.CONCRETE]: 1, [ResourceType.LUMBER]: 1 },
    [BuildingType.SETTLEMENT]: { [ResourceType.CONCRETE]: 1, [ResourceType.LUMBER]: 1, [ResourceType.TEXTILE]: 1, [ResourceType.FOOD]: 1 },
    [BuildingType.CITY]: { [ResourceType.FOOD]: 2, [ResourceType.DIAMOND]: 3 }
};
const CARD_COST = { [ResourceType.DIAMOND]: 1, [ResourceType.TEXTILE]: 1, [ResourceType.FOOD]: 1 };
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
const generateMap = () => {
    const radius = 2;
    const tiles = [];
    const terrains = [
        ...Array(5).fill(TerrainType.FIELDS),
        ...Array(4).fill(TerrainType.FOREST),
        ...Array(4).fill(TerrainType.HILLS),
        ...Array(3).fill(TerrainType.PASTURE),
        ...Array(2).fill(TerrainType.MOUNTAINS),
        TerrainType.DESERT
    ];
    const numbers = [2, 12, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11];
    const shuffledTerrains = shuffle(terrains);
    const shuffledNumbers = shuffle(numbers);
    let numberIndex = 0;
    for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) {
            const terrain = shuffledTerrains.pop() || TerrainType.DESERT;
            let num = terrain === TerrainType.DESERT ? null : shuffledNumbers[numberIndex++];
            tiles.push({ coord: { q, r }, terrain: terrain, number: num, hasRobber: terrain === TerrainType.DESERT });
        }
    }
    return tiles;
};
export class RoomManager {
    constructor(id, name, password) {
        this.devCardDeck = []; // Deste
        this.name = name;
        this.password = password;
        this.room = {
            id,
            tiles: generateMap(),
            players: [],
            buildings: [],
            status: GameStatus.LOBBY,
            activePlayerId: null,
            hostId: null,
            turnSubPhase: 'waiting',
            setupTurnIndex: 0,
            currentTradeOffer: null,
            // CUMOR: Yeni Alanlar
            winnerId: null,
            longestRoadPlayerId: null,
            largestArmyPlayerId: null,
            activeCartelPlayerId: null,
        };
        this.initializeDeck(); // Desteyi karıştır
    }
    // DESTE OLUŞTURMA
    initializeDeck() {
        // Kural kitabında sayı belirtilmemiş, dengeli bir dağılım yapıyoruz:
        const cards = [
            ...Array(14).fill(DevCardType.MERCENARY),
            ...Array(5).fill(DevCardType.VICTORY_POINT),
            ...Array(2).fill(DevCardType.SABOTAGE),
            ...Array(2).fill(DevCardType.CARTEL),
            ...Array(2).fill(DevCardType.INSURANCE)
        ];
        this.devCardDeck = shuffle(cards);
    }
    addPlayer(id, name, color) {
        if (this.room.status !== GameStatus.LOBBY)
            throw new Error("Oyun başladı, giriş yapılamaz!");
        if (this.room.players.length >= 4)
            throw new Error("Oda dolu!");
        if (this.room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
            throw new Error("İsim alınmış.");
        if (this.room.players.some(p => p.color === color))
            throw new Error("Renk alınmış.");
        this.room.players.push({
            id, name, color,
            resources: { [ResourceType.LUMBER]: 0, [ResourceType.CONCRETE]: 0, [ResourceType.TEXTILE]: 0, [ResourceType.FOOD]: 0, [ResourceType.DIAMOND]: 0, [ResourceType.GOLD]: 0 },
            // YENİ: Kartlar için boş el
            devCards: {
                [DevCardType.MERCENARY]: 0,
                [DevCardType.SABOTAGE]: 0,
                [DevCardType.CARTEL]: 0,
                [DevCardType.INSURANCE]: 0,
                [DevCardType.VICTORY_POINT]: 0
            },
            victoryPoints: 0, longestRoad: 0, armySize: 0
        });
        if (!this.room.hostId)
            this.room.hostId = id;
    }
    // --- TİCARET SİSTEMİ ---
    tradeWithBank(playerId, sellResource) {
        const player = this.room.players.find(p => p.id === playerId);
        if (!player)
            throw new Error("Oyuncu yok");
        const rates = { [ResourceType.FOOD]: 3, [ResourceType.LUMBER]: 3, [ResourceType.CONCRETE]: 2, [ResourceType.TEXTILE]: 2, [ResourceType.DIAMOND]: 1 };
        const required = rates[sellResource];
        if (!required || player.resources[sellResource] < required)
            throw new Error("Yetersiz Kaynak!");
        player.resources[sellResource] -= required;
        player.resources[ResourceType.GOLD] += 1;
    }
    buyFromBlackMarket(playerId, buyResource) {
        const player = this.room.players.find(p => p.id === playerId);
        if (!player)
            throw new Error("Oyuncu yok");
        // Dinamik Karaborsa Oranı: Oyuncunun en iyi yapısına göre (araziden bağımsız)
        const myBuildings = this.room.buildings.filter(b => b.ownerId === playerId);
        const hasCity = myBuildings.some(b => b.type === BuildingType.CITY);
        const hasSettlement = myBuildings.some(b => b.type === BuildingType.SETTLEMENT);
        const hasRoad = myBuildings.some(b => b.type === BuildingType.ROAD);
        let cost = 5; // Hiç yapı yoksa
        if (hasCity)
            cost = 2; // Şehir varsa en iyi oran
        else if (hasSettlement)
            cost = 3; // Köy varsa
        else if (hasRoad)
            cost = 4; // Sadece yol varsa
        if (player.resources[ResourceType.GOLD] < cost)
            throw new Error(`Yetersiz Altın! ${cost} Altın gerekli.`);
        player.resources[ResourceType.GOLD] -= cost;
        player.resources[buyResource] += 1;
    }
    // KART SATIN ALMA [cite: 71]
    buyDevelopmentCard(playerId) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        if (this.devCardDeck.length === 0)
            throw new Error("Deste tükendi!");
        // Maliyet Kontrolü ve Ödeme
        this.chargePlayer(playerId, CARD_COST);
        // Kart Çekme
        const card = this.devCardDeck.pop();
        if (!card)
            throw new Error("Kart çekilemedi.");
        // Oyuncuya Ekleme
        const player = this.room.players.find(p => p.id === playerId);
        if (player) {
            // TypeScript için cast gerekebilir veya Player tipini shared'da güncellemelisin
            player.devCards[card]++;
            // Zafer Puanı ise hemen işle (Gizli kalabilir ama puanı artmalı mı? Genelde gizli tutulur)
            // Şimdilik sadece ele ekliyoruz.
        }
    }
    // --- KART OYNAMA ---
    playDevelopmentCard(playerId, cardType) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        const player = this.room.players.find(p => p.id === playerId);
        if (!player)
            throw new Error("Oyuncu bulunamadı");
        // Kart var mı kontrolü
        if (!player.devCards || player.devCards[cardType] <= 0) {
            throw new Error("Bu karta sahip değilsin!");
        }
        // Kartı düş
        player.devCards[cardType]--;
        // ETKİLERİ UYGULA
        switch (cardType) {
            case DevCardType.MERCENARY: // Paralı Asker [cite: 74-75]
                // Ordu sayısını artır (En Güçlü Ordu için)
                player.armySize++;
                // Hırsızı hareket ettirme modunu açar (Zarda 7 gelmiş gibi)
                this.room.turnSubPhase = 'robber';
                return `Paralı Asker oynandı! Ordu: ${player.armySize} ⚔️ Vergi Memurunu taşı.`;
            case DevCardType.VICTORY_POINT: // Zafer Puanı [cite: 93-94]
                player.victoryPoints++;
                return "Zafer Puanı kartı oynandı! +1 Puan.";
            case DevCardType.SABOTAGE: // Sabotaj [cite: 81-82]
                this.room.turnSubPhase = 'sabotage';
                return "Sabotaj kartı oynandı! Yıkılacak yolu seç. 💣";
            case DevCardType.CARTEL: // Kartel [cite: 85-86]
                // KARTEL AKTİF! Sıra tekrar bu oyuncuya gelene kadar tüm kaynaklar ona gider
                this.room.activeCartelPlayerId = playerId;
                return "🏴‍☠️ KARTEL İLAN EDİLDİ! Sıra size gelene kadar TÜM KAYNAKLAR SİZİN!";
            case DevCardType.INSURANCE:
                throw new Error("Yol Sigortası sadece saldırı anında otomatik kullanılır!");
        }
    }
    // YENİ: YOL YIKMA VE ENKAZ BIRAKMA
    sabotageRoad(playerId, coords) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        if (this.room.turnSubPhase !== 'sabotage')
            throw new Error("Sabotaj modunda değilsin!");
        // Hedef Yolu Bul
        const roadIndex = this.room.buildings.findIndex(b => b.type === BuildingType.ROAD &&
            b.coord.q === coords.q &&
            b.coord.r === coords.r &&
            b.coord.edgeIndex === coords.edgeIndex);
        if (roadIndex === -1)
            throw new Error("Burada yol yok!");
        const targetRoad = this.room.buildings[roadIndex];
        if (targetRoad.ownerId === playerId)
            throw new Error("Kendi yolunu sabote edemezsin!");
        // YOL SİGORTASI KONTROLÜ
        const victim = this.room.players.find(p => p.id === targetRoad.ownerId);
        if (victim) {
            const hasInsurance = victim.devCards?.[DevCardType.INSURANCE] > 0;
            if (hasInsurance) {
                // Sigorta kartını harca
                victim.devCards[DevCardType.INSURANCE]--;
                // Modu normale döndür
                this.room.turnSubPhase = 'waiting';
                throw new Error(`🛡️ SABOTAJ ENGELLENDİ! ${victim.name}'in Yol Sigortası vardı! Kartın boşa gitti.`);
            }
        }
        // Yolu Sil, Yerine ENKAZ Koy (originalOwnerId'yi kaydet - tamir maliyeti için)
        this.room.buildings[roadIndex] = {
            ...targetRoad,
            type: BuildingType.DEBRIS,
            originalOwnerId: targetRoad.ownerId, // Eski sahip (tamir maliyeti için)
            ownerId: 'DEBRIS' // Artık sahipsiz
        };
        // Modu normale döndür
        this.room.turnSubPhase = 'waiting';
    }
    // ENKAZ TAMİR SİSTEMİ
    repairDebris(playerId, coords) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        // Enkazı bul
        const debrisIndex = this.room.buildings.findIndex(b => b.type === BuildingType.DEBRIS &&
            b.coord.q === coords.q &&
            b.coord.r === coords.r &&
            b.coord.edgeIndex === coords.edgeIndex);
        if (debrisIndex === -1)
            throw new Error("Bu konumda enkaz yok!");
        const debris = this.room.buildings[debrisIndex];
        const isOriginalOwner = debris.originalOwnerId === playerId;
        if (isOriginalOwner) {
            // Eski sahip: Sadece 1 Kereste (altyapıyı biliyor)
            this.chargePlayer(playerId, { [ResourceType.LUMBER]: 1 });
        }
        else {
            // Yeni işgalci: 1 Kereste + 1 Beton + 2 Altın (sıfırdan yapıyor)
            this.chargePlayer(playerId, {
                [ResourceType.LUMBER]: 1,
                [ResourceType.CONCRETE]: 1,
                [ResourceType.GOLD]: 2
            });
        }
        // Enkazı yola çevir
        this.room.buildings[debrisIndex] = {
            ...debris,
            type: BuildingType.ROAD,
            ownerId: playerId,
            originalOwnerId: undefined // Artık enkaz değil
        };
    }
    // --- P2P TİCARET ---
    createP2PTrade(playerId, give, want) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        const player = this.room.players.find(p => p.id === playerId);
        if (!player)
            throw new Error("Oyuncu yok");
        for (const res in give) {
            const r = res;
            if (give[r] > 0 && player.resources[r] < give[r])
                throw new Error(`Yetersiz kaynak: ${r}`);
        }
        this.room.currentTradeOffer = { id: Math.random().toString(36).substr(2, 9), offererId: playerId, give, want, acceptors: [] };
    }
    acceptP2PTrade(playerId) {
        const offer = this.room.currentTradeOffer;
        if (!offer)
            throw new Error("Aktif teklif yok.");
        if (offer.offererId === playerId)
            throw new Error("Kendi teklifini kabul edemezsin.");
        const player = this.room.players.find(p => p.id === playerId);
        if (!player)
            throw new Error("Oyuncu yok");
        for (const res in offer.want) {
            const r = res;
            if (offer.want[r] > 0 && player.resources[r] < offer.want[r])
                throw new Error(`Teklifi karşılayacak kaynağın yok: ${r}`);
        }
        if (!offer.acceptors.includes(playerId))
            offer.acceptors.push(playerId);
    }
    finalizeP2PTrade(offererId, partnerId) {
        const offer = this.room.currentTradeOffer;
        if (!offer)
            throw new Error("Aktif teklif yok.");
        if (offer.offererId !== offererId)
            throw new Error("Bu teklif senin değil.");
        if (!offer.acceptors.includes(partnerId))
            throw new Error("Bu oyuncu teklifi kabul etmedi.");
        const offerer = this.room.players.find(p => p.id === offererId);
        const partner = this.room.players.find(p => p.id === partnerId);
        if (!offerer || !partner)
            throw new Error("Oyuncular bulunamadı.");
        for (const res in offer.give) {
            const r = res;
            offerer.resources[r] -= offer.give[r];
            partner.resources[r] += offer.give[r];
        }
        for (const res in offer.want) {
            const r = res;
            partner.resources[r] -= offer.want[r];
            offerer.resources[r] += offer.want[r];
        }
        this.room.currentTradeOffer = null;
    }
    cancelP2PTrade(playerId) { if (this.room.currentTradeOffer?.offererId === playerId)
        this.room.currentTradeOffer = null; }
    // --- İNŞAAT ---
    upgradeSettlement(playerId, coords) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        // ŞEHİR LİMİTİ: Maksimum 4 şehir
        const cityCount = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.CITY).length;
        if (cityCount >= 4)
            throw new Error("Maksimum şehir sayısına ulaştın! (4/4)");
        this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.CITY]);
        const buildingIndex = this.room.buildings.findIndex(b => b.coord.q === coords.q && b.coord.r === coords.r && b.coord.vertexIndex === coords.vertexIndex);
        if (buildingIndex === -1)
            throw new Error("Burada bir bina yok!");
        if (this.room.buildings[buildingIndex].ownerId !== playerId)
            throw new Error("Bu bina senin değil!");
        if (this.room.buildings[buildingIndex].type !== BuildingType.SETTLEMENT)
            throw new Error("Sadece köyler şehre dönüşebilir!");
        this.room.buildings[buildingIndex] = { ...this.room.buildings[buildingIndex], type: BuildingType.CITY };
        this.room.turnSubPhase = 'waiting';
    }
    buildSettlement(playerId, coords) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        const isSetup = this.room.status.startsWith('setup');
        // KÖY LİMİTİ: Maksimum 5 köy (şehre dönüşenler köy değil)
        if (!isSetup) {
            const settlementCount = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.SETTLEMENT).length;
            if (settlementCount >= 5)
                throw new Error("Maksimum köy sayısına ulaştın! (5/5) Şehir yap veya bekle.");
        }
        if (!isSetup)
            this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.SETTLEMENT]);
        const targetPos = this.getVertexPixelPos(coords.q, coords.r, coords.vertexIndex);
        const isOccupied = this.room.buildings.some(b => b.type !== BuildingType.ROAD && this.getDistance(targetPos, this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex)) < 5);
        if (isOccupied)
            throw new Error("Bu köşe dolu!");
        // MESAFE KURALI: 2 yol mesafesi (yaklaşık 1 altıgen kenarı)
        const isTooClose = this.room.buildings.some(b => b.type !== BuildingType.ROAD && this.getDistance(targetPos, this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex)) < (HEX_SIZE + 5));
        if (isTooClose)
            throw new Error("Çok yakın! Yapılar arası en az 2 yol mesafesi olmalı.");
        if (!isSetup) {
            const hasRoadConnection = this.room.buildings.some(b => {
                if (b.ownerId !== playerId || b.type !== BuildingType.ROAD)
                    return false;
                const { start, end } = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex);
                return this.getDistance(targetPos, start) < 5 || this.getDistance(targetPos, end) < 5;
            });
            if (!hasRoadConnection)
                throw new Error("Kendi yolunla bağlantı yok!");
        }
        this.room.buildings.push({ id: Math.random().toString(), type: BuildingType.SETTLEMENT, ownerId: playerId, coord: coords });
        if (isSetup && this.room.setupTurnIndex >= this.room.players.length)
            this.giveInitialResources(playerId, coords);
        if (isSetup)
            this.room.turnSubPhase = 'road';
    }
    buildRoad(playerId, coords) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        const isSetup = this.room.status.startsWith('setup');
        // YOL LİMİTİ: Maksimum 15 yol
        if (!isSetup) {
            const roadCount = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.ROAD).length;
            if (roadCount >= 15)
                throw new Error("Maksimum yol sayısına ulaştın! (15/15)");
        }
        if (!isSetup)
            this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.ROAD]);
        const targetEndpoints = this.getRoadEndpoints(coords.q, coords.r, coords.edgeIndex);
        const midPoint = { x: (targetEndpoints.start.x + targetEndpoints.end.x) / 2, y: (targetEndpoints.start.y + targetEndpoints.end.y) / 2 };
        // Aynı yerde yol var mı kontrolü
        const isOccupied = this.room.buildings.some(b => {
            if (b.type !== BuildingType.ROAD && b.type !== BuildingType.DEBRIS)
                return false;
            const bEndpoints = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex);
            const bMid = { x: (bEndpoints.start.x + bEndpoints.end.x) / 2, y: (bEndpoints.start.y + bEndpoints.end.y) / 2 };
            return this.getDistance(midPoint, bMid) < 5;
        });
        if (isOccupied)
            throw new Error("Bu kenar dolu! (Yol veya enkaz var)");
        const isConnected = this.room.buildings.some(b => {
            if (b.ownerId !== playerId)
                return false;
            if (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) {
                const bPos = this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex);
                return this.getDistance(bPos, targetEndpoints.start) < 5 || this.getDistance(bPos, targetEndpoints.end) < 5;
            }
            if (b.type === BuildingType.ROAD) {
                const bEndpoints = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex);
                return (this.getDistance(bEndpoints.start, targetEndpoints.start) < 5 || this.getDistance(bEndpoints.start, targetEndpoints.end) < 5 || this.getDistance(bEndpoints.end, targetEndpoints.start) < 5 || this.getDistance(bEndpoints.end, targetEndpoints.end) < 5);
            }
            return false;
        });
        if (!isConnected)
            throw new Error("Kendi yapılarınla bağlantı yok!");
        this.room.buildings.push({ id: Math.random().toString(), type: BuildingType.ROAD, ownerId: playerId, coord: { ...coords, vertexIndex: -1 } });
        if (isSetup)
            this.advanceSetupTurn();
    }
    // --- OYUN AKIŞI ve HIRSIZ (YENİ) ---
    rollDice(playerId) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2;
        if (total === 7) {
            this.handleDiceSeven(); // Hırsız tetiklenir
        }
        else {
            this.distributeResources(total);
        }
        return { die1: d1, die2: d2, total };
    }
    // ÜRETİM (BLOKE MANTIĞI BURADA)
    distributeResources(total) {
        // KARTEL KONTROLÜ: Kartel aktifse tüm kaynaklar kartel sahibine gider!
        const cartelOwner = this.room.activeCartelPlayerId
            ? this.room.players.find(p => p.id === this.room.activeCartelPlayerId)
            : null;
        // !t.hasRobber KONTROLÜ: Hırsız varsa o araziyi filtrele, üretim yapma!
        this.room.tiles.filter(t => t.number === total && !t.hasRobber).forEach(tile => {
            const res = this.getTerrainResource(tile.terrain);
            if (!res)
                return;
            const producers = new Set();
            // 1. Bina Üretimi
            this.room.buildings.forEach(b => {
                if ((b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && this.isBuildingOnTile(b, tile)) {
                    const amount = b.type === BuildingType.CITY ? 2 : 1;
                    if (cartelOwner) {
                        // KARTEL AKTİF: Tüm kaynaklar kartel sahibine gider (Altın değil, sadece kaynak!)
                        cartelOwner.resources[res] += amount;
                    }
                    else {
                        // Normal üretim
                        const p = this.room.players.find(player => player.id === b.ownerId);
                        if (p) {
                            p.resources[res] += amount;
                            producers.add(p.id);
                        }
                    }
                }
            });
            // 2. Yol Vergisi + Ticaret Rotası Bonusu (Kartel aktifken Altın verilmez)
            if (!cartelOwner) {
                // Her oyuncu için bu arazideki yol sayısını hesapla
                const playerRoadCounts = new Map();
                this.room.buildings.forEach(b => {
                    if (b.type === BuildingType.ROAD && this.isRoadOnTile(b, tile)) {
                        const currentCount = playerRoadCounts.get(b.ownerId) || 0;
                        playerRoadCounts.set(b.ownerId, currentCount + 1);
                    }
                });
                // Yol vergisi dağıt (yapısı olmayanlara)
                playerRoadCounts.forEach((roadCount, ownerId) => {
                    if (!producers.has(ownerId)) {
                        // Yapısı yoksa yol vergisi al
                        const hasBuilding = this.room.buildings.some(otherB => otherB.ownerId === ownerId &&
                            (otherB.type === BuildingType.SETTLEMENT || otherB.type === BuildingType.CITY) &&
                            this.isBuildingOnTile(otherB, tile));
                        if (!hasBuilding) {
                            const p = this.room.players.find(player => player.id === ownerId);
                            if (p) {
                                // TİCARET ROTASI BONUSU: 2+ yol varsa 2 Altın, yoksa 1 Altın
                                const goldAmount = roadCount >= 2 ? 2 : 1;
                                p.resources[ResourceType.GOLD] += goldAmount;
                            }
                        }
                    }
                });
            }
        });
    }
    // Hırsız Mantığı: Stok Kontrolü
    handleDiceSeven() {
        this.room.players.forEach(p => {
            // 1. KAYNAK CEZASI: 7'den fazla kaynak varsa yarısını at
            const totalResources = Object.entries(p.resources)
                .filter(([key]) => key !== ResourceType.GOLD)
                .reduce((sum, [_, count]) => sum + count, 0);
            if (totalResources > 7) {
                let toDiscard = Math.floor(totalResources / 2);
                // Rastgele kaynak sil
                while (toDiscard > 0) {
                    const availableTypes = Object.keys(p.resources).filter(r => r !== ResourceType.GOLD && p.resources[r] > 0);
                    if (availableTypes.length === 0)
                        break;
                    const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
                    p.resources[randomType]--;
                    toDiscard--;
                }
            }
            // 2. ALTIN BİRİKTİRME CEZASI: 20+ Altın varsa yarısı gider
            const goldAmount = p.resources[ResourceType.GOLD];
            if (goldAmount >= 20) {
                const goldToLose = Math.floor(goldAmount / 2);
                p.resources[ResourceType.GOLD] -= goldToLose;
            }
        });
        // Oyunu "Hırsız Taşıma" moduna al
        // Types.ts güncellemesi yapmadığımız için string literal olarak 'robber' kullanıyoruz
        // Client tarafında bu 'robber' statüsünü tanımalıyız.
        this.room.turnSubPhase = 'robber';
    }
    // 1. ADIM: Hırsızı Taşı ve Kurbanları Bul (Çalma yapma, sadece listele)
    moveRobber(playerId, tileCoord) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        // turnSubPhase kontrolünü esnek bıraktım, dilersen ekleyebilirsin
        // Hırsızı Taşı
        this.room.tiles.forEach(t => t.hasRobber = false);
        const targetTile = this.room.tiles.find(t => t.coord.q === tileCoord.q && t.coord.r === tileCoord.r);
        if (!targetTile)
            throw new Error("Arazi bulunamadı!");
        targetTile.hasRobber = true;
        // O arazideki rakipleri bul (Yolu olanlar dahil edilmez, sadece Köy/Şehir)
        const victims = this.room.buildings
            .filter(b => (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && b.ownerId !== playerId && this.isBuildingOnTile(b, targetTile))
            .map(b => b.ownerId);
        // Unique (Benzersiz) ID listesi döndür
        return [...new Set(victims)];
    }
    // 2. ADIM: Seçilen Kişiyi Soy (Notifications için veri döndür)
    robPlayer(thiefId, victimId) {
        if (this.room.activePlayerId !== thiefId)
            throw new Error("Sıra sende değil!");
        const thief = this.room.players.find(p => p.id === thiefId);
        const victim = this.room.players.find(p => p.id === victimId);
        if (!thief || !victim)
            throw new Error("Oyuncular bulunamadı!");
        let stolenMessage = "";
        // Önce Kaynak Çal
        const resourceTypes = Object.keys(victim.resources).filter(r => r !== ResourceType.GOLD && victim.resources[r] > 0);
        if (resourceTypes.length > 0) {
            const stolenRes = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
            victim.resources[stolenRes]--;
            thief.resources[stolenRes]++;
            stolenMessage = `1 ${stolenRes}`;
        }
        // Kaynak yoksa Altın Çal (Max 2)
        else if (victim.resources[ResourceType.GOLD] > 0) {
            const goldAmount = Math.min(2, victim.resources[ResourceType.GOLD]);
            victim.resources[ResourceType.GOLD] -= goldAmount;
            thief.resources[ResourceType.GOLD] += goldAmount;
            stolenMessage = `${goldAmount} Altın`;
        }
        else {
            stolenMessage = "HİÇBİR ŞEY (Kasa boş!)";
        }
        // Turu normale döndür
        this.room.turnSubPhase = 'waiting';
        return { stolenMessage, victimName: victim.name, thiefName: thief.name };
    }
    endTurn(playerId) {
        if (this.room.activePlayerId !== playerId)
            throw new Error("Sıra sende değil!");
        // Kartel kontrolü: Sıra kartel sahibine gelirse kartel biter
        const idx = this.room.players.findIndex(p => p.id === playerId);
        const nextPlayerId = this.room.players[(idx + 1) % this.room.players.length].id;
        if (this.room.activeCartelPlayerId && this.room.activeCartelPlayerId === nextPlayerId) {
            this.room.activeCartelPlayerId = null;
        }
        this.room.activePlayerId = nextPlayerId;
        this.room.turnSubPhase = 'waiting';
        // --- KAZANMA KONTROLÜ ---
        this.updateAllVictoryPoints();
        const winner = this.checkWinCondition();
        if (winner) {
            this.room.winnerId = winner;
            this.room.status = GameStatus.FINISHED;
        }
    }
    // === CUMOR: ZAFER PUANI SİSTEMİ ===
    // Tüm oyuncuların VP'sini güncelle
    updateAllVictoryPoints() {
        // Önce En Uzun Yol ve En Güçlü Ordu sahiplerini belirle
        this.updateLongestRoadHolder();
        this.updateLargestArmyHolder();
        // Her oyuncunun VP'sini hesapla
        for (const player of this.room.players) {
            player.victoryPoints = this.calculateVictoryPoints(player.id);
        }
    }
    // Tek bir oyuncunun VP'sini hesapla
    calculateVictoryPoints(playerId) {
        const player = this.room.players.find(p => p.id === playerId);
        if (!player)
            return 0;
        let vp = 0;
        // 1. Köyler (+1 her biri)
        const settlements = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.SETTLEMENT).length;
        vp += settlements;
        // 2. Şehirler (+2 her biri)
        const cities = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.CITY).length;
        vp += cities * 2;
        // 3. En Uzun Yol (+2)
        if (this.room.longestRoadPlayerId === playerId) {
            vp += 2;
        }
        // 4. En Güçlü Ordu (+2)
        if (this.room.largestArmyPlayerId === playerId) {
            vp += 2;
        }
        // 5. Zafer Puanı Kartları
        const vpCards = player.devCards?.[DevCardType.VICTORY_POINT] || 0;
        vp += vpCards;
        // 6. Ekonomik Lider: 15+ Altın = +1 VP
        if (player.resources[ResourceType.GOLD] >= 15) {
            vp += 1;
        }
        return vp;
    }
    // Kazanan var mı kontrol et
    checkWinCondition() {
        for (const player of this.room.players) {
            if (player.victoryPoints >= 10) {
                return player.id;
            }
        }
        return null;
    }
    // === EN UZUN YOL HESAPLAMA ===
    updateLongestRoadHolder() {
        const MIN_ROAD_LENGTH = 5;
        let maxLength = MIN_ROAD_LENGTH - 1;
        let newHolder = this.room.longestRoadPlayerId;
        for (const player of this.room.players) {
            const roadLength = this.calculateLongestRoad(player.id);
            player.longestRoad = roadLength; // Player'a da kaydet
            // Mevcut sahibi geçmek için DAHA FAZLA olmalı
            if (roadLength >= MIN_ROAD_LENGTH) {
                if (this.room.longestRoadPlayerId === player.id) {
                    // Zaten sahip, sadece uzunluk kontrolü
                    if (roadLength > maxLength) {
                        maxLength = roadLength;
                    }
                }
                else {
                    // Başkası, eski sahibi geçmesi lazım
                    const currentHolder = this.room.players.find(p => p.id === this.room.longestRoadPlayerId);
                    const currentHolderLength = currentHolder?.longestRoad || 0;
                    if (roadLength > currentHolderLength && roadLength > maxLength) {
                        maxLength = roadLength;
                        newHolder = player.id;
                    }
                }
            }
        }
        // Eğer mevcut sahip artık min uzunluğa sahip değilse
        if (this.room.longestRoadPlayerId) {
            const currentHolder = this.room.players.find(p => p.id === this.room.longestRoadPlayerId);
            if (currentHolder && currentHolder.longestRoad < MIN_ROAD_LENGTH) {
                // En uzunu bul
                let newMax = MIN_ROAD_LENGTH - 1;
                newHolder = null;
                for (const p of this.room.players) {
                    if (p.longestRoad >= MIN_ROAD_LENGTH && p.longestRoad > newMax) {
                        newMax = p.longestRoad;
                        newHolder = p.id;
                    }
                }
            }
        }
        this.room.longestRoadPlayerId = newHolder;
    }
    // DFS ile en uzun bağlantılı yol zincirini hesapla
    calculateLongestRoad(playerId) {
        // Oyuncunun tüm yollarını al
        const playerRoads = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.ROAD);
        if (playerRoads.length === 0)
            return 0;
        // Graf oluştur: her yolun endpoint'lerini kaydet
        const edges = [];
        for (const road of playerRoads) {
            const endpoints = this.getRoadEndpoints(road.coord.q, road.coord.r, road.coord.edgeIndex);
            edges.push({
                start: endpoints.start,
                end: endpoints.end,
                id: road.id
            });
        }
        // Her kenardan başlayarak DFS yap
        let maxLength = 0;
        for (const startEdge of edges) {
            const visited = new Set();
            const length1 = this.dfsRoadLength(startEdge, startEdge.start, visited, edges, playerId);
            visited.clear();
            const length2 = this.dfsRoadLength(startEdge, startEdge.end, visited, edges, playerId);
            maxLength = Math.max(maxLength, length1, length2);
        }
        return maxLength;
    }
    // DFS helper: Bir noktadan başlayarak bağlantılı yolları say
    dfsRoadLength(currentEdge, fromPoint, visited, allEdges, playerId) {
        visited.add(currentEdge.id);
        // Diğer uç nokta
        const otherPoint = this.getDistance(currentEdge.start, fromPoint) < 5 ? currentEdge.end : currentEdge.start;
        // Bu noktada rakip köy/şehir var mı? Varsa zincir kesilir
        const hasEnemyBuilding = this.room.buildings.some(b => (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) &&
            b.ownerId !== playerId &&
            this.getDistance(this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex), otherPoint) < 5);
        if (hasEnemyBuilding) {
            return 1; // Bu yol sayılır ama devam edilmez
        }
        // Bu noktaya bağlı diğer yolları bul
        let maxBranch = 0;
        for (const edge of allEdges) {
            if (visited.has(edge.id))
                continue;
            // Bu kenar otherPoint'e bağlı mı?
            const connectsAtStart = this.getDistance(edge.start, otherPoint) < 5;
            const connectsAtEnd = this.getDistance(edge.end, otherPoint) < 5;
            if (connectsAtStart || connectsAtEnd) {
                const branchLength = this.dfsRoadLength(edge, otherPoint, new Set(visited), allEdges, playerId);
                maxBranch = Math.max(maxBranch, branchLength);
            }
        }
        return 1 + maxBranch;
    }
    // === EN GÜÇLÜ ORDU HESAPLAMA ===
    updateLargestArmyHolder() {
        const MIN_ARMY = 3;
        let maxArmy = MIN_ARMY - 1;
        let newHolder = this.room.largestArmyPlayerId;
        for (const player of this.room.players) {
            if (player.armySize >= MIN_ARMY) {
                // Mevcut sahibi geçmek için DAHA FAZLA olmalı
                if (this.room.largestArmyPlayerId === player.id) {
                    // Zaten sahip
                    if (player.armySize > maxArmy) {
                        maxArmy = player.armySize;
                    }
                }
                else {
                    // Başkası
                    const currentHolder = this.room.players.find(p => p.id === this.room.largestArmyPlayerId);
                    const currentHolderArmy = currentHolder?.armySize || 0;
                    if (player.armySize > currentHolderArmy && player.armySize > maxArmy) {
                        maxArmy = player.armySize;
                        newHolder = player.id;
                    }
                }
            }
        }
        // Eğer mevcut sahip artık min orduya sahip değilse
        if (this.room.largestArmyPlayerId) {
            const currentHolder = this.room.players.find(p => p.id === this.room.largestArmyPlayerId);
            if (currentHolder && currentHolder.armySize < MIN_ARMY) {
                newHolder = null;
                for (const p of this.room.players) {
                    if (p.armySize >= MIN_ARMY && p.armySize > maxArmy) {
                        maxArmy = p.armySize;
                        newHolder = p.id;
                    }
                }
            }
        }
        this.room.largestArmyPlayerId = newHolder;
    }
    // --- PRIVATE HELPERS ---
    isBuildingOnTile(building, tile) {
        const { x: tx, y: ty } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
        const bPos = this.getVertexPixelPos(building.coord.q, building.coord.r, building.coord.vertexIndex);
        return this.getDistance(bPos, { x: tx, y: ty }) < (HEX_SIZE + 5);
    }
    isRoadOnTile(building, tile) {
        const { x: tx, y: ty } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
        const { start, end } = this.getRoadEndpoints(building.coord.q, building.coord.r, building.coord.edgeIndex);
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        return this.getDistance({ x: midX, y: midY }, { x: tx, y: ty }) < 45;
    }
    getVertexPixelPos(q, r, vertexIndex) {
        const { x, y } = hexToPixel(q, r, HEX_SIZE);
        return getHexCorners(x, y, HEX_SIZE)[vertexIndex];
    }
    getRoadEndpoints(q, r, edgeIndex) {
        const { x, y } = hexToPixel(q, r, HEX_SIZE);
        const corners = getHexCorners(x, y, HEX_SIZE);
        return { start: corners[edgeIndex], end: corners[(edgeIndex + 1) % 6] };
    }
    getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }
    getTerrainResource(terrain) {
        const map = { [TerrainType.FOREST]: ResourceType.LUMBER, [TerrainType.HILLS]: ResourceType.CONCRETE, [TerrainType.PASTURE]: ResourceType.TEXTILE, [TerrainType.FIELDS]: ResourceType.FOOD, [TerrainType.MOUNTAINS]: ResourceType.DIAMOND };
        return map[terrain] || null;
    }
    chargePlayer(playerId, cost) {
        const p = this.room.players.find(player => player.id === playerId);
        if (!p)
            throw new Error("Oyuncu yok!");
        Object.entries(cost).forEach(([res, amt]) => { if (p.resources[res] < amt)
            throw new Error("Yetersiz Kaynak!"); });
        Object.entries(cost).forEach(([res, amt]) => p.resources[res] -= amt);
    }
    giveInitialResources(playerId, coords) {
        const p = this.room.players.find(player => player.id === playerId);
        if (!p)
            return;
        this.room.tiles.forEach(tile => {
            if (this.isBuildingOnTile({ coord: coords }, tile)) {
                const res = this.getTerrainResource(tile.terrain);
                if (res)
                    p.resources[res] += 1;
            }
        });
    }
    advanceSetupTurn() {
        const total = this.room.players.length;
        this.room.setupTurnIndex++;
        if (this.room.setupTurnIndex >= total * 2) {
            this.room.status = GameStatus.PLAYING;
            this.room.activePlayerId = this.room.players[0].id;
            this.room.turnSubPhase = 'waiting';
            return;
        }
        const idx = (this.room.setupTurnIndex < total) ? this.room.setupTurnIndex : (total * 2 - 1) - this.room.setupTurnIndex;
        this.room.activePlayerId = this.room.players[idx].id;
        this.room.turnSubPhase = 'settlement';
    }
    startGame(reqId) {
        if (reqId !== this.room.hostId)
            throw new Error("Sadece Host!");
        // 1. ZAR ATMA: Herkes için 2d6 at
        const rolls = this.room.players.map(p => {
            const d1 = Math.floor(Math.random() * 6) + 1;
            const d2 = Math.floor(Math.random() * 6) + 1;
            return { id: p.id, name: p.name, total: d1 + d2 };
        });
        // 2. SIRALAMA: Zara göre azalan (Eşitlikte rastgele)
        rolls.sort((a, b) => b.total - a.total || Math.random() - 0.5);
        // 3. Oyuncu listesini güncelle
        const newOrder = [];
        rolls.forEach(r => {
            const player = this.room.players.find(p => p.id === r.id);
            if (player) {
                player.resources[ResourceType.GOLD] = 3; // Başlangıç altını
                newOrder.push(player);
            }
        });
        this.room.players = newOrder;
        this.room.status = GameStatus.SETUP_ROUND_1;
        this.room.activePlayerId = this.room.players[0].id;
        this.room.turnSubPhase = 'settlement';
        // 4. SONUÇ MESAJI
        const rollText = rolls.map(r => `${r.name}(${r.total})`).join(', ');
        return `Başlangıç Zarları: ${rollText}. ${this.room.players[0].name} Başlıyor! 🎲`;
    }
    getRoomInfo() { return { id: this.room.id, name: this.name, playerCount: this.room.players.length, maxPlayers: 4, isLocked: !!this.password, status: this.room.status }; }
    getGameState() { return this.room; }
    removePlayer(id) { this.room.players = this.room.players.filter(p => p.id !== id); }
    isEmpty() { return this.room.players.length === 0; }
}
