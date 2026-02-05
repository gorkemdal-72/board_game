import { GameState, Tile, PlayerColor, GameStatus, RoomInfo, TerrainType, ResourceType, Building, BuildingType, TradeOffer, DevCardType } from '@cax/shared';
import { hexToPixel, getHexCorners } from '@cax/shared'; 

const HEX_SIZE = 50;

const BUILDING_COSTS = {
  [BuildingType.ROAD]: { [ResourceType.CONCRETE]: 1, [ResourceType.LUMBER]: 1 },
  [BuildingType.SETTLEMENT]: { [ResourceType.CONCRETE]: 1, [ResourceType.LUMBER]: 1, [ResourceType.TEXTILE]: 1, [ResourceType.FOOD]: 1 },
  [BuildingType.CITY]: { [ResourceType.FOOD]: 2, [ResourceType.DIAMOND]: 3 }
};

const CARD_COST = { [ResourceType.DIAMOND]: 1, [ResourceType.TEXTILE]: 1, [ResourceType.FOOD]: 1 };

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const generateMap = (): Tile[] => {
  const radius = 2; 
  const tiles: Tile[] = [];
  const terrains: TerrainType[] = [
    ...Array(5).fill(TerrainType.FIELDS),
    ...Array(4).fill(TerrainType.FOREST),
    ...Array(4).fill(TerrainType.HILLS),
    ...Array(3).fill(TerrainType.PASTURE),
    ...Array(2).fill(TerrainType.MOUNTAINS),
    TerrainType.DESERT
  ];
  const numbers: number[] = [2, 12, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11];
  const shuffledTerrains = shuffle(terrains);
  const shuffledNumbers = shuffle(numbers);
  let numberIndex = 0;

  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const terrain = shuffledTerrains.pop() || TerrainType.DESERT;
      let num: number | null = terrain === TerrainType.DESERT ? null : shuffledNumbers[numberIndex++];
      tiles.push({ coord: { q, r }, terrain: terrain, number: num, hasRobber: terrain === TerrainType.DESERT });
    }
  }
  return tiles;
};

export class RoomManager {
  private room: GameState;
  public password?: string;
  public name: string;
  private devCardDeck: DevCardType[] = []; // Deste

  constructor(id: string, name: string, password?: string) {
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
    };
    this.initializeDeck(); // Desteyi karıştır
  }

  // DESTE OLUŞTURMA
  private initializeDeck() {
    // Kural kitabında sayı belirtilmemiş, dengeli bir dağılım yapıyoruz:
    const cards: DevCardType[] = [
      ...Array(14).fill(DevCardType.MERCENARY),
      ...Array(5).fill(DevCardType.VICTORY_POINT),
      ...Array(2).fill(DevCardType.SABOTAGE),
      ...Array(2).fill(DevCardType.CARTEL),
      ...Array(2).fill(DevCardType.INSURANCE)
    ];
    this.devCardDeck = shuffle(cards);
  }

  addPlayer(id: string, name: string, color: PlayerColor) {
    if (this.room.status !== GameStatus.LOBBY) throw new Error("Oyun başladı, giriş yapılamaz!");
    if (this.room.players.length >= 4) throw new Error("Oda dolu!");
    if (this.room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error("İsim alınmış.");
    if (this.room.players.some(p => p.color === color)) throw new Error("Renk alınmış.");

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
      } as any,
      victoryPoints: 0, longestRoad: 0, armySize: 0
    });
    if (!this.room.hostId) this.room.hostId = id;
  }

  // --- TİCARET SİSTEMİ ---
  tradeWithBank(playerId: string, sellResource: ResourceType) {
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu yok");
    const rates: Record<string, number> = { [ResourceType.FOOD]: 3, [ResourceType.LUMBER]: 3, [ResourceType.CONCRETE]: 2, [ResourceType.TEXTILE]: 2, [ResourceType.DIAMOND]: 1 };
    const required = rates[sellResource];
    if (!required || player.resources[sellResource] < required) throw new Error("Yetersiz Kaynak!");
    player.resources[sellResource] -= required;
    player.resources[ResourceType.GOLD] += 1;
  }

  buyFromBlackMarket(playerId: string, buyResource: ResourceType) {
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu yok");

    let cost = 5; 
    const relatedTiles = this.room.tiles.filter(t => this.getTerrainResource(t.terrain) === buyResource);

    const hasCity = this.room.buildings.some(b => b.ownerId === playerId && b.type === BuildingType.CITY && relatedTiles.some(t => this.isBuildingOnTile(b, t)));
    const hasSettlement = this.room.buildings.some(b => b.ownerId === playerId && b.type === BuildingType.SETTLEMENT && relatedTiles.some(t => this.isBuildingOnTile(b, t)));
    const hasRoad = this.room.buildings.some(b => b.ownerId === playerId && b.type === BuildingType.ROAD && relatedTiles.some(t => this.isRoadOnTile(b, t)));

    if (hasCity) cost = 2;
    else if (hasSettlement) cost = 3;
    else if (hasRoad) cost = 4;

    if (player.resources[ResourceType.GOLD] < cost) throw new Error(`Yetersiz Altın! ${cost} Altın gerekli.`);
    player.resources[ResourceType.GOLD] -= cost;
    player.resources[buyResource] += 1;
  }

  // KART SATIN ALMA [cite: 71]
  buyDevelopmentCard(playerId: string) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    if (this.devCardDeck.length === 0) throw new Error("Deste tükendi!");

    // Maliyet Kontrolü ve Ödeme
    this.chargePlayer(playerId, CARD_COST);

    // Kart Çekme
    const card = this.devCardDeck.pop();
    if (!card) throw new Error("Kart çekilemedi.");

    // Oyuncuya Ekleme
    const player = this.room.players.find(p => p.id === playerId);
    if (player) {
      // TypeScript için cast gerekebilir veya Player tipini shared'da güncellemelisin
      (player as any).devCards[card]++;
      
      // Zafer Puanı ise hemen işle (Gizli kalabilir ama puanı artmalı mı? Genelde gizli tutulur)
      // Şimdilik sadece ele ekliyoruz.
    }
  }

  // --- KART OYNAMA ---
  playDevelopmentCard(playerId: string, cardType: DevCardType) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu bulunamadı");

    // Kart var mı kontrolü
    if (!(player as any).devCards || (player as any).devCards[cardType] <= 0) {
      throw new Error("Bu karta sahip değilsin!");
    }

    // Kartı düş
    (player as any).devCards[cardType]--;

    // ETKİLERİ UYGULA
    switch (cardType) {
      case DevCardType.MERCENARY: // Paralı Asker [cite: 74-75]
        // Hırsızı hareket ettirme modunu açar (Zarda 7 gelmiş gibi)
        (this.room.turnSubPhase as any) = 'robber';
        return "Paralı Asker oynandı! Vergi Memurunu taşı.";

      case DevCardType.VICTORY_POINT: // Zafer Puanı [cite: 93-94]
        player.victoryPoints++;
        return "Zafer Puanı kartı oynandı! +1 Puan.";

      case DevCardType.SABOTAGE: // Sabotaj [cite: 81-82]
        // Yol yıkma modunu açmamız lazım (Bunu bir sonraki adımda detaylı yapacağız)
        // Şimdilik sadece kartı harcıyor
        (this.room.turnSubPhase as any) = 'sabotage'; 
        return "Sabotaj kartı oynandı! Yıkılacak yolu seç. 💣";
      case DevCardType.CARTEL: // Kartel [cite: 85-86]
        // Kaynak seçimi modalı açılmalı
        return "Kartel oynandı! (Henüz kaynak seçimi aktif değil)";
      
      case DevCardType.INSURANCE:
        throw new Error("Yol Sigortası sadece saldırı anında otomatik kullanılır!");
    }
  }

  // YENİ: YOL YIKMA VE ENKAZ BIRAKMA
  sabotageRoad(playerId: string, coords: { q: number, r: number, edgeIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    if ((this.room.turnSubPhase as any) !== 'sabotage') throw new Error("Sabotaj modunda değilsin!");

    // Hedef Yolu Bul
    const roadIndex = this.room.buildings.findIndex(b => 
      b.type === BuildingType.ROAD &&
      b.coord.q === coords.q && 
      b.coord.r === coords.r && 
      b.coord.edgeIndex === coords.edgeIndex
    );

    if (roadIndex === -1) throw new Error("Burada yol yok!");
    const targetRoad = this.room.buildings[roadIndex];

    if (targetRoad.ownerId === playerId) throw new Error("Kendi yolunu sabote edemezsin!");

    // Yolu Sil, Yerine ENKAZ Koy
    // Not: Enkazın sahibi yoktur (ownerId: null veya 'system') ama tamir kuralı için eski sahibini tutmak gerekebilir.
    // Şimdilik ownerId'yi 'debris' yapıyoruz veya boş bırakıyoruz.
    this.room.buildings[roadIndex] = {
      ...targetRoad,
      type: BuildingType.DEBRIS, // Tipi değişti
      ownerId: 'DEBRIS' // Sahipsiz
    };

    // Modu normale döndür
    this.room.turnSubPhase = 'waiting';
  }

  // --- P2P TİCARET ---
  createP2PTrade(playerId: string, give: Record<ResourceType, number>, want: Record<ResourceType, number>) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu yok");
    for (const res in give) {
      const r = res as ResourceType;
      if (give[r] > 0 && player.resources[r] < give[r]) throw new Error(`Yetersiz kaynak: ${r}`);
    }
    this.room.currentTradeOffer = { id: Math.random().toString(36).substr(2, 9), offererId: playerId, give, want, acceptors: [] };
  }

  acceptP2PTrade(playerId: string) {
    const offer = this.room.currentTradeOffer;
    if (!offer) throw new Error("Aktif teklif yok.");
    if (offer.offererId === playerId) throw new Error("Kendi teklifini kabul edemezsin.");
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu yok");
    for (const res in offer.want) {
      const r = res as ResourceType;
      if (offer.want[r] > 0 && player.resources[r] < offer.want[r]) throw new Error(`Teklifi karşılayacak kaynağın yok: ${r}`);
    }
    if (!offer.acceptors.includes(playerId)) offer.acceptors.push(playerId);
  }

  finalizeP2PTrade(offererId: string, partnerId: string) {
    const offer = this.room.currentTradeOffer;
    if (!offer) throw new Error("Aktif teklif yok.");
    if (offer.offererId !== offererId) throw new Error("Bu teklif senin değil.");
    if (!offer.acceptors.includes(partnerId)) throw new Error("Bu oyuncu teklifi kabul etmedi.");
    const offerer = this.room.players.find(p => p.id === offererId);
    const partner = this.room.players.find(p => p.id === partnerId);
    if (!offerer || !partner) throw new Error("Oyuncular bulunamadı.");
    for (const res in offer.give) { const r = res as ResourceType; offerer.resources[r] -= offer.give[r]; partner.resources[r] += offer.give[r]; }
    for (const res in offer.want) { const r = res as ResourceType; partner.resources[r] -= offer.want[r]; offerer.resources[r] += offer.want[r]; }
    this.room.currentTradeOffer = null;
  }

  cancelP2PTrade(playerId: string) { if (this.room.currentTradeOffer?.offererId === playerId) this.room.currentTradeOffer = null; }

  // --- İNŞAAT ---
  upgradeSettlement(playerId: string, coords: { q: number, r: number, vertexIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.CITY]);
    const buildingIndex = this.room.buildings.findIndex(b => b.coord.q === coords.q && b.coord.r === coords.r && b.coord.vertexIndex === coords.vertexIndex);
    if (buildingIndex === -1) throw new Error("Burada bir bina yok!");
    if (this.room.buildings[buildingIndex].ownerId !== playerId) throw new Error("Bu bina senin değil!");
    if (this.room.buildings[buildingIndex].type !== BuildingType.SETTLEMENT) throw new Error("Sadece köyler şehre dönüşebilir!");
    this.room.buildings[buildingIndex] = { ...this.room.buildings[buildingIndex], type: BuildingType.CITY };
    this.room.turnSubPhase = 'waiting';
  }

  buildSettlement(playerId: string, coords: { q: number, r: number, vertexIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const isSetup = this.room.status.startsWith('setup');
    if (!isSetup) this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.SETTLEMENT]);
    const targetPos = this.getVertexPixelPos(coords.q, coords.r, coords.vertexIndex);
    const isOccupied = this.room.buildings.some(b => b.type !== BuildingType.ROAD && this.getDistance(targetPos, this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex!)) < 5);
    if (isOccupied) throw new Error("Dolu!");
    const isTooClose = this.room.buildings.some(b => b.type !== BuildingType.ROAD && this.getDistance(targetPos, this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex!)) < (HEX_SIZE + 5));
    if (isTooClose) throw new Error("Mesafe Kuralı!");
    if (!isSetup) {
      const hasRoadConnection = this.room.buildings.some(b => {
        if (b.ownerId !== playerId || b.type !== BuildingType.ROAD) return false;
        const { start, end } = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex!);
        return this.getDistance(targetPos, start) < 5 || this.getDistance(targetPos, end) < 5;
      });
      if (!hasRoadConnection) throw new Error("Bağlantı yok!");
    }
    this.room.buildings.push({ id: Math.random().toString(), type: BuildingType.SETTLEMENT, ownerId: playerId, coord: coords });
    if (isSetup && this.room.setupTurnIndex >= this.room.players.length) this.giveInitialResources(playerId, coords);
    if (isSetup) this.room.turnSubPhase = 'road';
  }

  buildRoad(playerId: string, coords: { q: number, r: number, edgeIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const isSetup = this.room.status.startsWith('setup');
    if (!isSetup) this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.ROAD]);
    const targetEndpoints = this.getRoadEndpoints(coords.q, coords.r, coords.edgeIndex);
    const midPoint = { x: (targetEndpoints.start.x + targetEndpoints.end.x) / 2, y: (targetEndpoints.start.y + targetEndpoints.end.y) / 2 };
    const isOccupied = this.room.buildings.some(b => {
      if (b.type !== BuildingType.ROAD) return false;
      const bEndpoints = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex!);
      const bMid = { x: (bEndpoints.start.x + bEndpoints.end.x) / 2, y: (bEndpoints.start.y + bEndpoints.end.y) / 2 };
      return this.getDistance(midPoint, bMid) < 5;
    });
    if (isOccupied) throw new Error("Dolu!");
    const isConnected = this.room.buildings.some(b => {
      if (b.ownerId !== playerId) return false;
      if (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) {
        const bPos = this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex!);
        return this.getDistance(bPos, targetEndpoints.start) < 5 || this.getDistance(bPos, targetEndpoints.end) < 5;
      }
      if (b.type === BuildingType.ROAD) {
        const bEndpoints = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex!);
        return (this.getDistance(bEndpoints.start, targetEndpoints.start) < 5 || this.getDistance(bEndpoints.start, targetEndpoints.end) < 5 || this.getDistance(bEndpoints.end, targetEndpoints.start) < 5 || this.getDistance(bEndpoints.end, targetEndpoints.end) < 5);
      }
      return false;
    });
    if (!isConnected) throw new Error("Bağlantı yok!");
    this.room.buildings.push({ id: Math.random().toString(), type: BuildingType.ROAD, ownerId: playerId, coord: { ...coords, vertexIndex: -1 } });
    if (isSetup) this.advanceSetupTurn();
  }

  // --- OYUN AKIŞI ve HIRSIZ (YENİ) ---
  rollDice(playerId: string) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;

    if (total === 7) {
      this.handleDiceSeven(); // Hırsız tetiklenir
    } else {
      this.distributeResources(total);
    }
    return { die1: d1, die2: d2, total };
  }

  // ÜRETİM (BLOKE MANTIĞI BURADA)
  private distributeResources(total: number) {
    // !t.hasRobber KONTROLÜ: Hırsız varsa o araziyi filtrele, üretim yapma!
    this.room.tiles.filter(t => t.number === total && !t.hasRobber).forEach(tile => {
      const res = this.getTerrainResource(tile.terrain);
      if (!res) return;
      const producers = new Set<string>();
      
      // 1. Bina Üretimi
      this.room.buildings.forEach(b => {
        if ((b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && this.isBuildingOnTile(b, tile)) {
          const p = this.room.players.find(player => player.id === b.ownerId);
          if (p) { p.resources[res] += (b.type === BuildingType.CITY ? 2 : 1); producers.add(p.id); }
        }
      });

      // 2. Yol Vergisi
      this.room.buildings.forEach(b => {
        if (b.type === BuildingType.ROAD && this.isRoadOnTile(b, tile)) {
           const hasBuilding = this.room.buildings.some(otherB => otherB.ownerId === b.ownerId && (otherB.type === BuildingType.SETTLEMENT || otherB.type === BuildingType.CITY) && this.isBuildingOnTile(otherB, tile));
           if (!hasBuilding && !producers.has(b.ownerId)) {
              const p = this.room.players.find(player => player.id === b.ownerId);
              if (p) p.resources[ResourceType.GOLD] += 1;
           }
        }
      });
    });
  }

  // Hırsız Mantığı: Stok Kontrolü
  private handleDiceSeven() {
    this.room.players.forEach(p => {
      // Altın hariç toplam kaynak
      const totalResources = Object.entries(p.resources)
        .filter(([key]) => key !== ResourceType.GOLD)
        .reduce((sum, [_, count]) => sum + count, 0);

      // KURAL: 7'den fazla varsa yarısını at
      if (totalResources > 7) {
        let toDiscard = Math.floor(totalResources / 2);
        
        // Basitlik için: Rastgele kaynak sil (Oyuncuya seçtirmek için yeni state gerekir, şimdilik otomatik)
        while (toDiscard > 0) {
          const availableTypes = Object.keys(p.resources).filter(r => r !== ResourceType.GOLD && p.resources[r as ResourceType] > 0);
          if (availableTypes.length === 0) break;
          const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)] as ResourceType;
          p.resources[randomType]--;
          toDiscard--;
        }
      }
    });

    // Oyunu "Hırsız Taşıma" moduna al
    // Types.ts güncellemesi yapmadığımız için string literal olarak 'robber' kullanıyoruz
    // Client tarafında bu 'robber' statüsünü tanımalıyız.
    (this.room.turnSubPhase as any) = 'robber'; 
  }

  // 1. ADIM: Hırsızı Taşı ve Kurbanları Bul (Çalma yapma, sadece listele)
  moveRobber(playerId: string, tileCoord: { q: number, r: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    // turnSubPhase kontrolünü esnek bıraktım, dilersen ekleyebilirsin

    // Hırsızı Taşı
    this.room.tiles.forEach(t => t.hasRobber = false);
    const targetTile = this.room.tiles.find(t => t.coord.q === tileCoord.q && t.coord.r === tileCoord.r);
    if (!targetTile) throw new Error("Arazi bulunamadı!");
    targetTile.hasRobber = true;

    // O arazideki rakipleri bul (Yolu olanlar dahil edilmez, sadece Köy/Şehir)
    const victims = this.room.buildings
      .filter(b => (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && b.ownerId !== playerId && this.isBuildingOnTile(b, targetTile))
      .map(b => b.ownerId);
    
    // Unique (Benzersiz) ID listesi döndür
    return [...new Set(victims)];
  }

  // 2. ADIM: Seçilen Kişiyi Soy (Notifications için veri döndür)
  robPlayer(thiefId: string, victimId: string) {
    if (this.room.activePlayerId !== thiefId) throw new Error("Sıra sende değil!");

    const thief = this.room.players.find(p => p.id === thiefId);
    const victim = this.room.players.find(p => p.id === victimId);

    if (!thief || !victim) throw new Error("Oyuncular bulunamadı!");

    let stolenMessage = "";
    
    // Önce Kaynak Çal
    const resourceTypes = Object.keys(victim.resources).filter(r => r !== ResourceType.GOLD && victim.resources[r as ResourceType] > 0);
    
    if (resourceTypes.length > 0) {
      const stolenRes = resourceTypes[Math.floor(Math.random() * resourceTypes.length)] as ResourceType;
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
    } else {
      stolenMessage = "HİÇBİR ŞEY (Kasa boş!)";
    }

    // Turu normale döndür
    this.room.turnSubPhase = 'waiting';

    return { stolenMessage, victimName: victim.name, thiefName: thief.name };
  }

  endTurn(playerId: string) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const idx = this.room.players.findIndex(p => p.id === playerId);
    this.room.activePlayerId = this.room.players[(idx + 1) % this.room.players.length].id;
    this.room.turnSubPhase = 'waiting';
  }

  // --- PRIVATE HELPERS ---
  private isBuildingOnTile(building: Building | { coord: { q: number, r: number, vertexIndex: number } }, tile: Tile): boolean {
    const { x: tx, y: ty } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
    const bPos = this.getVertexPixelPos(building.coord.q, building.coord.r, building.coord.vertexIndex!);
    return this.getDistance(bPos, { x: tx, y: ty }) < (HEX_SIZE + 5);
  }
  private isRoadOnTile(building: Building, tile: Tile): boolean {
    const { x: tx, y: ty } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
    const { start, end } = this.getRoadEndpoints(building.coord.q, building.coord.r, building.coord.edgeIndex!);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    return this.getDistance({ x: midX, y: midY }, { x: tx, y: ty }) < 45;
  }
  private getVertexPixelPos(q: number, r: number, vertexIndex: number) {
    const { x, y } = hexToPixel(q, r, HEX_SIZE);
    return getHexCorners(x, y, HEX_SIZE)[vertexIndex];
  }
  private getRoadEndpoints(q: number, r: number, edgeIndex: number) {
    const { x, y } = hexToPixel(q, r, HEX_SIZE);
    const corners = getHexCorners(x, y, HEX_SIZE);
    return { start: corners[edgeIndex], end: corners[(edgeIndex + 1) % 6] };
  }
  private getDistance(p1: {x:number, y:number}, p2: {x:number, y:number}) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }
  private getTerrainResource(terrain: TerrainType): ResourceType | null {
    const map: any = { [TerrainType.FOREST]: ResourceType.LUMBER, [TerrainType.HILLS]: ResourceType.CONCRETE, [TerrainType.PASTURE]: ResourceType.TEXTILE, [TerrainType.FIELDS]: ResourceType.FOOD, [TerrainType.MOUNTAINS]: ResourceType.DIAMOND };
    return map[terrain] || null;
  }
  private chargePlayer(playerId: string, cost: any) {
    const p = this.room.players.find(player => player.id === playerId);
    if (!p) throw new Error("Oyuncu yok!");
    Object.entries(cost).forEach(([res, amt]) => { if (p.resources[res as ResourceType] < (amt as number)) throw new Error("Yetersiz Kaynak!"); });
    Object.entries(cost).forEach(([res, amt]) => p.resources[res as ResourceType] -= (amt as number));
  }
  private giveInitialResources(playerId: string, coords: { q: number, r: number, vertexIndex: number }) {
    const p = this.room.players.find(player => player.id === playerId);
    if (!p) return;
    this.room.tiles.forEach(tile => {
      if (this.isBuildingOnTile({ coord: coords } as any, tile)) {
        const res = this.getTerrainResource(tile.terrain);
        if (res) p.resources[res] += 1;
      }
    });
  }
  
  private advanceSetupTurn() {
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
  startGame(reqId: string) {
    if (reqId !== this.room.hostId) throw new Error("Sadece Host!");
    this.room.players.sort(() => Math.random() - 0.5).forEach(p => p.resources[ResourceType.GOLD] = 3);
    this.room.status = GameStatus.SETUP_ROUND_1;
    this.room.activePlayerId = this.room.players[0].id;
    this.room.turnSubPhase = 'settlement';
  }
  getRoomInfo(): RoomInfo { return { id: this.room.id, name: this.name, playerCount: this.room.players.length, maxPlayers: 4, isLocked: !!this.password, status: this.room.status }; }
  getGameState() { return this.room; }
  removePlayer(id: string) { this.room.players = this.room.players.filter(p => p.id !== id); }
  isEmpty() { return this.room.players.length === 0; }
}