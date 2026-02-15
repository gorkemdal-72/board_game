import { GameState, Tile, PlayerColor, GameStatus, RoomInfo, TerrainType, ResourceType, Building, BuildingType, TradeOffer, DevCardType } from '@cumor/shared';
import { hexToPixel, getHexCorners } from '@cumor/shared';

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

// HARİTA OLUŞTURMA: radius parametresiyle 4 kişilik (radius=2, 19 arazi) veya
// 5 kişilik (radius=3, 37 arazi) harita üretir
const generateMap = (radius: number = 2): Tile[] => {
  const tiles: Tile[] = [];

  // Arazi ve numara dağılımları harita boyutuna göre ayarlanır
  let terrains: TerrainType[];
  let numbers: number[];

  if (radius === 3) {
    // 5 KİŞİLİK BÜYÜK HARİTA (37 arazi = 34 üretken + 3 çöl)
    terrains = [
      ...Array(8).fill(TerrainType.FIELDS),    // 8 Gıda
      ...Array(8).fill(TerrainType.FOREST),    // 8 Kereste
      ...Array(7).fill(TerrainType.HILLS),     // 7 Beton
      ...Array(7).fill(TerrainType.PASTURE),   // 7 Tekstil
      ...Array(4).fill(TerrainType.MOUNTAINS), // 4 Elmas
      ...Array(3).fill(TerrainType.DESERT)     // 3 Çöl (toplam = 37)
    ];
    // 34 üretken arazi için numaralar (çöller numara almaz)
    numbers = [2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 8, 8, 8, 8, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12, 12];
  } else {
    // STANDART HARİTA (19 arazi = 18 üretken + 1 çöl)
    terrains = [
      ...Array(5).fill(TerrainType.FIELDS),
      ...Array(4).fill(TerrainType.FOREST),
      ...Array(4).fill(TerrainType.HILLS),
      ...Array(3).fill(TerrainType.PASTURE),
      ...Array(2).fill(TerrainType.MOUNTAINS),
      TerrainType.DESERT
    ];
    numbers = [2, 12, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11];
  }

  const shuffledTerrains = shuffle(terrains);
  const shuffledNumbers = shuffle(numbers);
  let numberIndex = 0;

  // Altıgen grid oluştur: q ve r koordinatlarıyla spiral döner
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const terrain = shuffledTerrains.pop() || TerrainType.DESERT;
      // Çöl arazileri numara almaz, diğerleri sıradaki numarayı alır
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
      tiles: generateMap(), // Varsayılan 4 kişilik harita (radius=2)
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
      startRolls: [],
      // YENİ: Gelişim kartı özel fazları (başlangıçta 0)
      freeRoadsRemaining: 0,  // Mühendis kartı kullanılınca 2 olur
      traderPicksRemaining: 0 // Tüccar kartı kullanılınca 3 olur
    };
    this.initializeDeck(); // Desteyi karıştır
  }

  // DESTE OLUŞTURMA: Tüm gelişim kartlarını desteye ekler ve karıştırır
  private initializeDeck() {
    const cards: DevCardType[] = [
      ...Array(14).fill(DevCardType.MERCENARY),  // 14x Paralı Asker (en yaygın)
      ...Array(5).fill(DevCardType.VICTORY_POINT), // 5x Zafer Puanı
      ...Array(2).fill(DevCardType.SABOTAGE),    // 2x Sabotaj
      ...Array(2).fill(DevCardType.CARTEL),       // 2x Kartel
      ...Array(2).fill(DevCardType.INSURANCE),    // 2x Yol Sigortası
      // YENİ KARTLAR:
      ...Array(2).fill(DevCardType.ENGINEER),     // 2x Mühendis (ücretsiz 2 yol)
      ...Array(2).fill(DevCardType.TRADER),       // 2x Tüccar (bankadan 3 kaynak)
      ...Array(1).fill(DevCardType.MERCATOR)      // 1x Mercator (çok güçlü, sadece 1 adet)
    ];
    this.devCardDeck = shuffle(cards);
  }

  // OYUNCU EKLEME: Lobide yeni oyuncu odaya katılır
  // Maksimum 5 kişi (5 kişide büyük harita oluşturulacak)
  addPlayer(id: string, name: string, color: PlayerColor) {
    if (this.room.status !== GameStatus.LOBBY) throw new Error("Oyun başladı, giriş yapılamaz!");
    if (this.room.players.length >= 5) throw new Error("Oda dolu! (Maks 5 kişi)");
    if (this.room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error("İsim alınmış.");
    if (this.room.players.some(p => p.color === color)) throw new Error("Renk alınmış.");

    // Boş kart eli oluştur (tüm kart tipleri 0'dan başlar)
    const emptyCardHand = {
      [DevCardType.MERCENARY]: 0,
      [DevCardType.SABOTAGE]: 0,
      [DevCardType.CARTEL]: 0,
      [DevCardType.INSURANCE]: 0,
      [DevCardType.VICTORY_POINT]: 0,
      [DevCardType.ENGINEER]: 0,   // YENİ: Mühendis kartı
      [DevCardType.TRADER]: 0,     // YENİ: Tüccar kartı
      [DevCardType.MERCATOR]: 0    // YENİ: Mercator kartı
    } as any;

    this.room.players.push({
      id, name, color,
      resources: { [ResourceType.LUMBER]: 0, [ResourceType.CONCRETE]: 0, [ResourceType.TEXTILE]: 0, [ResourceType.FOOD]: 0, [ResourceType.DIAMOND]: 0, [ResourceType.GOLD]: 0 },
      devCards: { ...emptyCardHand },
      newDevCards: { ...emptyCardHand },
      victoryPoints: 0, longestRoad: 0, armySize: 0
    });
    if (!this.room.hostId) this.room.hostId = id;
  }

  // --- TİCARET SİSTEMİ ---
  // İHRACAT: Kaynağı satarak Altın kazanma (SIRA KONTROLÜ EKLENDİ)
  tradeWithBank(playerId: string, sellResource: ResourceType) {
    // Sıra kontrolü: Sadece sırası gelen oyuncu ihracat yapabilir
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil! İhracat yapmak için sıranı bekle.");
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu yok");
    const rates: Record<string, number> = { [ResourceType.FOOD]: 3, [ResourceType.LUMBER]: 3, [ResourceType.CONCRETE]: 2, [ResourceType.TEXTILE]: 2, [ResourceType.DIAMOND]: 1 };
    const required = rates[sellResource];
    if (!required || player.resources[sellResource] < required) throw new Error("Yetersiz Kaynak!");
    player.resources[sellResource] -= required;
    player.resources[ResourceType.GOLD] += 1;
  }

  buyFromBlackMarket(playerId: string, resource: ResourceType) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    if (this.room.turnSubPhase !== 'waiting') {
      throw new Error("Şu an ticaret yapamazsın.");
    }

    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu bulunamadı.");

    // Karaborsa fiyatını belirle - KONUM BAZLI (Hex Geometri)
    const myBuildings = this.room.buildings.filter(b => b.ownerId === playerId);
    let rate = 5;

    // 1. Hedef kaynağı üreten arazileri bul
    const targetTiles = this.room.tiles.filter(t => this.getTerrainResource(t.terrain) === resource);

    // 2. Her bir hedef arazi için kontrol et
    for (const tile of targetTiles) {
      const { x, y } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
      const tileCorners = getHexCorners(x, y, HEX_SIZE);

      // Bu arazi üzerinde oyuncunun YAPISI var mı? (Sadece Köy/Şehir)
      const myStructures = myBuildings.filter(b => b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY);
      for (const building of myStructures) {
        // GÜVENLİK: vertexIndex kontrolü
        const vIdx = building.coord.vertexIndex;
        if (vIdx === undefined || vIdx === null || vIdx < 0 || vIdx >= 6) continue;

        // Binanın koordinatını piksele çevir
        const { x: bx, y: by } = hexToPixel(building.coord.q, building.coord.r, HEX_SIZE);
        const buildingCorners = getHexCorners(bx, by, HEX_SIZE);
        const buildingPos = buildingCorners[vIdx];

        // Bina, arazinin köşelerinden birine yakın mı?
        const isOnTile = tileCorners.some(corner => {
          const dx = corner.x - buildingPos.x;
          const dy = corner.y - buildingPos.y;
          return Math.sqrt(dx * dx + dy * dy) < 5;
        });

        if (isOnTile) {
          if (building.type === BuildingType.CITY) rate = Math.min(rate, 2);
          else if (building.type === BuildingType.SETTLEMENT) rate = Math.min(rate, 3);
        }
      }
    }

    // Eğer binası yoksa (rate hala 5), ama oyuncunun genel olarak yolu varsa 4.
    if (rate === 5 && myBuildings.some(b => b.type === BuildingType.ROAD)) {
      rate = 4;
    }

    if ((player.resources[ResourceType.GOLD] || 0) < rate) {
      throw new Error(`Yeterli altın yok! (${rate} Altın gerekli)`);
    }

    player.resources[ResourceType.GOLD] -= rate;
    player.resources[resource] = (player.resources[resource] || 0) + 1;

    return `Karaborsadan ${rate} altına 1 ${resource} alındı.`;
  }

  // 15 Kuralı: 15 Altın = 1 VP
  buyVictoryPoint(playerId: string) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");

    // Sadece ana fazda (inşaat vs) yapılabilir
    if (this.room.turnSubPhase !== 'waiting') {
      throw new Error("Şu an puan satın alamazsın.");
    }

    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu bulunamadı.");

    if ((player.resources[ResourceType.GOLD] || 0) < 15) {
      throw new Error("Yeterli altın yok! (15 Altın gerekli)");
    }

    // İşlem
    player.resources[ResourceType.GOLD] -= 15;
    player.victoryPoints += 1;

    return `${player.name}, 15 Altın ödeyerek 1 Zafer Puanı satın aldı! 🏆`;
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
      // Satın alınan kart "newDevCards"ına eklenir (bu tur kullanılamaz)
      // newDevCards yoksa boş el oluştur (tüm kart tipleri dahil)
      if (!player.newDevCards) {
        player.newDevCards = {
          [DevCardType.MERCENARY]: 0,
          [DevCardType.SABOTAGE]: 0,
          [DevCardType.CARTEL]: 0,
          [DevCardType.INSURANCE]: 0,
          [DevCardType.VICTORY_POINT]: 0,
          [DevCardType.ENGINEER]: 0,
          [DevCardType.TRADER]: 0,
          [DevCardType.MERCATOR]: 0
        };
      }
      player.newDevCards[card] = (player.newDevCards[card] || 0) + 1;
    }
  }

  // --- KART OYNAMA: Her kart türünün farklı etkisi var ---
  // targetResource parametresi Mercator kartı için kullanılır (hangi kaynak isteniyor)
  playDevelopmentCard(playerId: string, cardType: DevCardType, targetResource?: ResourceType) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");

    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu bulunamadı");

    // VP Kartları Oynanmaz! Otomatik olarak puana eklenir
    if (cardType === DevCardType.VICTORY_POINT) {
      throw new Error("Zafer Puanı kartları oynanmaz! Otomatik olarak puanınıza eklenir.");
    }

    // Kart var mı kontrolü (Sadece devCards'a bak, newDevCards'ı sayma - bu tur alınanlar kullanılamaz)
    if (!player.devCards || player.devCards[cardType] <= 0) {
      throw new Error("Bu kartı şu an kullanamazsın (yeni aldıysan bir tur bekle).");
    }

    // Kartı elden düş
    player.devCards[cardType]--;

    // ETKİLERİ UYGULA (her kartın kendine özgü etkisi var)
    switch (cardType) {
      case DevCardType.MERCENARY:
        // PARALI ASKER: Ordu sayısını artırır + Vergi Memurunu taşıma modunu açar
        player.armySize++;
        (this.room.turnSubPhase as any) = 'robber';
        return `Paralı Asker oynandı! Ordu: ${player.armySize} ⚔️ Vergi Memurunu taşı.`;

      case DevCardType.SABOTAGE:
        // SABOTAJ: Rakip yol yıkma modunu açar
        (this.room.turnSubPhase as any) = 'sabotage';
        return "Sabotaj kartı oynandı! Yıkılacak yolu seç. 💣";

      case DevCardType.CARTEL:
        // KARTEL: Sıra tekrar bu oyuncuya gelene kadar tüm üretim kaynakları ona gider
        this.room.activeCartelPlayerId = playerId;
        return "🏴‍☠️ KARTEL İLAN EDİLDİ! Sıra size gelene kadar TÜM KAYNAKLAR SİZİN!";

      case DevCardType.INSURANCE:
        // SİGORTA: Manuel oynanamaz, sabotaj anında otomatik devreye girer
        throw new Error("Yol Sigortası sadece saldırı anında otomatik kullanılır!");

      case DevCardType.ENGINEER:
        // MÜHENDİS: Ücretsiz 2 yol yapma hakkı verir
        // free_road fazna geçer, buildRoad bu fazda ücret kesmez
        this.room.freeRoadsRemaining = 2;
        (this.room.turnSubPhase as any) = 'free_road';
        return "🛣️ Mühendis oynandı! 2 adet ÜCRETSIZ yol yapabilirsin!";

      case DevCardType.TRADER:
        // TÜCCAR: Bankadan istediğin 3 kaynağı bedava alırsın
        // trader_pick fazna geçer, client'tan 3 ayrı kaynak seçimi beklenir
        this.room.traderPicksRemaining = 3;
        (this.room.turnSubPhase as any) = 'trader_pick';
        return "📦 Tüccar oynandı! Bankadan 3 kaynak seç. (Her biri ayrı ayrı)";

      case DevCardType.MERCATOR:
        // MERCATOR: Bir kaynak türü söyle, her rakipten o kaynaktan MAX 2 al
        // Rakipte 0 varsa → 2 Altın ceza, 1 varsa → 1 kaynak + 1 Altın ceza, 2+ varsa → 2 kaynak
        if (!targetResource || targetResource === ResourceType.GOLD) {
          // Kartı geri koy (henüz oynanmadı)
          player.devCards[cardType]++;
          throw new Error("Geçerli bir kaynak türü seçmelisin! (Altın hariç)");
        }
        return this.executeMercator(playerId, targetResource);
    }
  }

  // MERCATOR KARTI ETKİSİ: Her rakipten seçilen kaynaktan max 2 adet al
  // Rakipte yoksa altın cezası uygula. Kaynak isimleri ile detaylı mesaj döndür.
  private executeMercator(playerId: string, targetResource: ResourceType): string {
    const player = this.room.players.find(p => p.id === playerId)!;
    let totalGained = 0;     // Toplam alınan kaynak
    let totalGoldPenalty = 0; // Toplam alınan altın cezası
    const details: string[] = [];

    // Her rakip için işlem yap
    for (const opponent of this.room.players) {
      if (opponent.id === playerId) continue; // Kendini atla

      const opponentHas = opponent.resources[targetResource] || 0;

      if (opponentHas >= 2) {
        // Rakipte 2 veya daha fazla var → 2 kaynak al
        opponent.resources[targetResource] -= 2;
        player.resources[targetResource] += 2;
        totalGained += 2;
        details.push(`${opponent.name}: 2 ${targetResource}`);
      } else if (opponentHas === 1) {
        // Rakipte sadece 1 var → 1 kaynak + 1 Altın ceza
        opponent.resources[targetResource] -= 1;
        player.resources[targetResource] += 1;
        totalGained += 1;
        // Altın cezası: Rakipten 1 altın al (varsa), yoksa 0
        const goldPenalty = Math.min(1, opponent.resources[ResourceType.GOLD] || 0);
        opponent.resources[ResourceType.GOLD] -= goldPenalty;
        player.resources[ResourceType.GOLD] += goldPenalty;
        totalGoldPenalty += goldPenalty;
        details.push(`${opponent.name}: 1 ${targetResource} + ${goldPenalty} 💰`);
      } else {
        // Rakipte hiç yok → 2 Altın ceza
        const goldPenalty = Math.min(2, opponent.resources[ResourceType.GOLD] || 0);
        opponent.resources[ResourceType.GOLD] -= goldPenalty;
        player.resources[ResourceType.GOLD] += goldPenalty;
        totalGoldPenalty += goldPenalty;
        details.push(`${opponent.name}: ${goldPenalty} 💰 (kaynak yok)`);
      }
    }

    return `🌍 MERCATOR! ${targetResource} talep edildi! +${totalGained} kaynak, +${totalGoldPenalty} altın. [${details.join(' | ')}]`;
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

    // YOL SİGORTASI KONTROLÜ
    const victim = this.room.players.find(p => p.id === targetRoad.ownerId);
    if (victim) {
      const hasInsurance = (victim as any).devCards?.[DevCardType.INSURANCE] > 0;
      if (hasInsurance) {
        // Sigorta kartını harca
        (victim as any).devCards[DevCardType.INSURANCE]--;
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
  repairDebris(playerId: string, coords: { q: number, r: number, edgeIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");

    // Enkazı bul
    const debrisIndex = this.room.buildings.findIndex(b =>
      b.type === BuildingType.DEBRIS &&
      b.coord.q === coords.q &&
      b.coord.r === coords.r &&
      b.coord.edgeIndex === coords.edgeIndex
    );

    if (debrisIndex === -1) throw new Error("Bu konumda enkaz yok!");

    const debris = this.room.buildings[debrisIndex];
    const isOriginalOwner = debris.originalOwnerId === playerId;

    if (isOriginalOwner) {
      // Eski sahip: Sadece 1 Kereste (altyapıyı biliyor)
      this.chargePlayer(playerId, { [ResourceType.LUMBER]: 1 });
    } else {
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
  createP2PTrade(playerId: string, give: Record<ResourceType, number>, want: Record<ResourceType, number>) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu yok");

    // CHEAT CODE: 7 Kereste/Tekstil/Elmas, 2 Beton/Gıda/Altın İSTE, Hiçbir şey VERME -> +5 ALTIN
    const isCheat =
      Object.values(give).every(v => v === 0) &&
      want[ResourceType.LUMBER] === 7 &&
      want[ResourceType.TEXTILE] === 7 &&
      want[ResourceType.DIAMOND] === 7 &&
      want[ResourceType.CONCRETE] === 2 &&
      want[ResourceType.FOOD] === 2 &&
      want[ResourceType.GOLD] === 2;

    if (isCheat) {
      player.resources[ResourceType.GOLD] += 5;
      return; // Ticaret oluşturma, sadece hile yap
    }

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

    // ŞEHİR LİMİTİ: Maksimum 4 şehir
    const cityCount = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.CITY).length;
    if (cityCount >= 4) throw new Error("Maksimum şehir sayısına ulaştın! (4/4)");

    // Validasyonu önce yap
    const buildingIndex = this.room.buildings.findIndex(b => b.coord.q === coords.q && b.coord.r === coords.r && b.coord.vertexIndex === coords.vertexIndex);
    if (buildingIndex === -1) throw new Error("Burada bir bina yok!");
    if (this.room.buildings[buildingIndex].ownerId !== playerId) throw new Error("Bu bina senin değil!");
    if (this.room.buildings[buildingIndex].type !== BuildingType.SETTLEMENT) throw new Error("Sadece köyler şehre dönüşebilir!");

    // PARAYI ŞİMDİ KES
    this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.CITY]);

    this.room.buildings[buildingIndex] = { ...this.room.buildings[buildingIndex], type: BuildingType.CITY };
    this.room.turnSubPhase = 'waiting';
  }

  buildSettlement(playerId: string, coords: { q: number, r: number, vertexIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const isSetup = this.room.status.startsWith('setup');

    // KÖY LİMİTİ: Maksimum 5 köy (şehre dönüşenler köy değil)
    if (!isSetup) {
      const settlementCount = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.SETTLEMENT).length;
      if (settlementCount >= 5) throw new Error("Maksimum köy sayısına ulaştın! (5/5) Şehir yap veya bekle.");
    }



    const targetPos = this.getVertexPixelPos(coords.q, coords.r, coords.vertexIndex);
    const isOccupied = this.room.buildings.some(b => (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && b.coord.vertexIndex !== undefined && this.getDistance(targetPos, this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex!)) < 5);
    if (isOccupied) throw new Error("Bu köşe dolu!");

    // MESAFE KURALI: 2 yol mesafesi (yaklaşık 1 altıgen kenarı)
    const isTooClose = this.room.buildings.some(b => (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && b.coord.vertexIndex !== undefined && this.getDistance(targetPos, this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex!)) < (HEX_SIZE + 5));
    if (isTooClose) throw new Error("Çok yakın! Yapılar arası en az 2 yol mesafesi olmalı.");

    if (!isSetup) {
      const hasRoadConnection = this.room.buildings.some(b => {
        if (b.ownerId !== playerId || b.type !== BuildingType.ROAD) return false;
        const { start, end } = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex!);
        return this.getDistance(targetPos, start) < 5 || this.getDistance(targetPos, end) < 5;
      });
      if (!hasRoadConnection) throw new Error("Kendi yolunla bağlantı yok!");
    }

    // PARAYI ŞİMDİ KES (Tüm kontrollerden sonra)
    if (!isSetup) this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.SETTLEMENT]);

    this.room.buildings.push({ id: Math.random().toString(), type: BuildingType.SETTLEMENT, ownerId: playerId, coord: coords });
    if (isSetup && this.room.setupTurnIndex >= this.room.players.length) this.giveInitialResources(playerId, coords);
    if (isSetup) this.room.turnSubPhase = 'road';
  }

  // YOL İNŞA ETME: Normal modda kaynak keser, free_road modunda (Mühendis kartı) ücretsiz yapar
  buildRoad(playerId: string, coords: { q: number, r: number, edgeIndex: number }) {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    const isSetup = this.room.status.startsWith('setup');
    const isFreeRoad = (this.room.turnSubPhase as any) === 'free_road'; // Mühendis kartı aktif mi?

    // YOL LİMİTİ: Maksimum 15 yol
    if (!isSetup) {
      const roadCount = this.room.buildings.filter(b => b.ownerId === playerId && b.type === BuildingType.ROAD).length;
      if (roadCount >= 15) throw new Error("Maksimum yol sayısına ulaştın! (15/15)");
    }

    // ÜCRET KESİMİ AŞAĞIYA TAŞINDI
    const targetEndpoints = this.getRoadEndpoints(coords.q, coords.r, coords.edgeIndex);
    const midPoint = { x: (targetEndpoints.start.x + targetEndpoints.end.x) / 2, y: (targetEndpoints.start.y + targetEndpoints.end.y) / 2 };

    // Aynı yerde yol var mı kontrolü
    const isOccupied = this.room.buildings.some(b => {
      if (b.type !== BuildingType.ROAD && b.type !== BuildingType.DEBRIS) return false;
      const bEndpoints = this.getRoadEndpoints(b.coord.q, b.coord.r, b.coord.edgeIndex!);
      const bMid = { x: (bEndpoints.start.x + bEndpoints.end.x) / 2, y: (bEndpoints.start.y + bEndpoints.end.y) / 2 };
      return this.getDistance(midPoint, bMid) < 5;
    });
    if (isOccupied) throw new Error("Bu kenar dolu! (Yol veya enkaz var)");

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
    if (!isConnected) throw new Error("Kendi yapılarınla bağlantı yok!");

    // ÜCRET KESİMİ: Setup'ta ve free_road modunda ücretsiz, normal modda kaynak kesilir
    if (!isSetup && !isFreeRoad) {
      this.chargePlayer(playerId, BUILDING_COSTS[BuildingType.ROAD]);
    }

    this.room.buildings.push({ id: Math.random().toString(), type: BuildingType.ROAD, ownerId: playerId, coord: { ...coords, vertexIndex: -1 } });

    // MÜHENDİS: Ücretsiz yol hakkını düşür, bitince normal moda dön
    if (isFreeRoad) {
      this.room.freeRoadsRemaining--;
      if (this.room.freeRoadsRemaining <= 0) {
        this.room.turnSubPhase = 'waiting'; // Tüm ücretsiz yollar kullanıldı
      }
    }

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
    // KARTEL KONTROLÜ: Kartel aktifse tüm kaynaklar kartel sahibine gider!
    const cartelOwner = this.room.activeCartelPlayerId
      ? this.room.players.find(p => p.id === this.room.activeCartelPlayerId)
      : null;

    // !t.hasRobber KONTROLÜ: Hırsız varsa o araziyi filtrele, üretim yapma!
    this.room.tiles.filter(t => t.number === total && !t.hasRobber).forEach(tile => {
      const res = this.getTerrainResource(tile.terrain);
      if (!res) return;
      const producers = new Set<string>();

      // 1. Bina Üretimi
      this.room.buildings.forEach(b => {
        if ((b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) && this.isBuildingOnTile(b, tile)) {
          const amount = b.type === BuildingType.CITY ? 2 : 1;

          if (cartelOwner) {
            // KARTEL AKTİF: Tüm kaynaklar kartel sahibine gider (Altın değil, sadece kaynak!)
            cartelOwner.resources[res] += amount;
          } else {
            // Normal üretim
            const p = this.room.players.find(player => player.id === b.ownerId);
            if (p) { p.resources[res] += amount; producers.add(p.id); }
          }
        }
      });

      // 2. Yol Vergisi + Ticaret Rotası Bonusu (Kartel aktifken Altın verilmez)
      if (!cartelOwner) {
        // Her oyuncu için bu arazideki yol sayısını hesapla
        const playerRoadCounts = new Map<string, number>();

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
            const hasBuilding = this.room.buildings.some(otherB =>
              otherB.ownerId === ownerId &&
              (otherB.type === BuildingType.SETTLEMENT || otherB.type === BuildingType.CITY) &&
              this.isBuildingOnTile(otherB, tile)
            );

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
  private handleDiceSeven() {
    this.room.players.forEach(p => {
      // 1. KAYNAK CEZASI: 7 veya daha fazla kaynak varsa yarısını at
      // Örnek: 7 kaynak → 3 atılır, 8 → 4, 9 → 4, 10 → 5 (Altın hariç sayılır)
      const totalResources = Object.entries(p.resources)
        .filter(([key]) => key !== ResourceType.GOLD)
        .reduce((sum, [_, count]) => sum + count, 0);

      if (totalResources >= 7) {
        let toDiscard = Math.floor(totalResources / 2);

        // Rastgele kaynak sil
        while (toDiscard > 0) {
          const availableTypes = Object.keys(p.resources).filter(r => r !== ResourceType.GOLD && p.resources[r as ResourceType] > 0);
          if (availableTypes.length === 0) break;
          const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)] as ResourceType;
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

    // YENİ: Turu biten oyuncunun 'newDevCards'larını 'devCards'a taşı
    const player = this.room.players.find(p => p.id === playerId);
    if (player && player.newDevCards) {
      for (const cardType in player.newDevCards) {
        const type = cardType as DevCardType;
        const count = player.newDevCards[type] || 0;
        if (count > 0) {
          player.devCards[type] = (player.devCards[type] || 0) + count;
          player.newDevCards[type] = 0;
        }
      }
    }

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
  private updateAllVictoryPoints() {
    // Önce En Uzun Yol ve En Güçlü Ordu sahiplerini belirle
    this.updateLongestRoadHolder();
    this.updateLargestArmyHolder();

    // Her oyuncunun VP'sini hesapla
    for (const player of this.room.players) {
      player.victoryPoints = this.calculateVictoryPoints(player.id);
    }
  }

  // Tek bir oyuncunun VP'sini hesapla
  private calculateVictoryPoints(playerId: string): number {
    const player = this.room.players.find(p => p.id === playerId);
    if (!player) return 0;

    let vp = 0;

    // 1. Köyler (+1 her biri)
    const settlements = this.room.buildings.filter(b =>
      b.ownerId === playerId && b.type === BuildingType.SETTLEMENT
    ).length;
    vp += settlements;

    // 2. Şehirler (+2 her biri)
    const cities = this.room.buildings.filter(b =>
      b.ownerId === playerId && b.type === BuildingType.CITY
    ).length;
    vp += cities * 2;

    // 3. En Uzun Yol (+2)
    if (this.room.longestRoadPlayerId === playerId) {
      vp += 2;
    }

    // 4. En Güçlü Ordu (+2)
    if (this.room.largestArmyPlayerId === playerId) {
      vp += 2;
    }

    // 5. Zafer Puanı Kartları (Hem eldeki hem yeniler!)
    const vpCardsOld = (player as any).devCards?.[DevCardType.VICTORY_POINT] || 0;
    const vpCardsNew = (player as any).newDevCards?.[DevCardType.VICTORY_POINT] || 0;
    vp += (vpCardsOld + vpCardsNew);

    // 6. Ekonomik Lider: 15+ Altın = +1 VP
    if (player.resources[ResourceType.GOLD] >= 15) {
      vp += 1;
    }

    return vp;
  }

  // Kazanan var mı kontrol et
  private checkWinCondition(): string | null {
    for (const player of this.room.players) {
      if (player.victoryPoints >= 10) {
        return player.id;
      }
    }
    return null;
  }

  // === EN UZUN YOL HESAPLAMA ===
  private updateLongestRoadHolder() {
    const MIN_ROAD_LENGTH = 5;
    let maxLength = MIN_ROAD_LENGTH - 1;
    let newHolder: string | null = this.room.longestRoadPlayerId;

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
        } else {
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
  private calculateLongestRoad(playerId: string): number {
    // Oyuncunun tüm yollarını al
    const playerRoads = this.room.buildings.filter(b =>
      b.ownerId === playerId && b.type === BuildingType.ROAD
    );

    if (playerRoads.length === 0) return 0;

    // Graf oluştur: her yolun endpoint'lerini kaydet
    const edges: { start: { x: number, y: number }, end: { x: number, y: number }, id: string }[] = [];

    for (const road of playerRoads) {
      const endpoints = this.getRoadEndpoints(road.coord.q, road.coord.r, road.coord.edgeIndex!);
      edges.push({
        start: endpoints.start,
        end: endpoints.end,
        id: road.id
      });
    }

    // Her kenardan başlayarak DFS yap
    let maxLength = 0;

    for (const startEdge of edges) {
      const visited = new Set<string>();
      const length1 = this.dfsRoadLength(startEdge, startEdge.start, visited, edges, playerId);
      visited.clear();
      const length2 = this.dfsRoadLength(startEdge, startEdge.end, visited, edges, playerId);
      maxLength = Math.max(maxLength, length1, length2);
    }

    return maxLength;
  }

  // DFS helper: Bir noktadan başlayarak bağlantılı yolları say
  private dfsRoadLength(
    currentEdge: { start: { x: number, y: number }, end: { x: number, y: number }, id: string },
    fromPoint: { x: number, y: number },
    visited: Set<string>,
    allEdges: { start: { x: number, y: number }, end: { x: number, y: number }, id: string }[],
    playerId: string
  ): number {
    visited.add(currentEdge.id);

    // Diğer uç nokta
    const otherPoint = this.getDistance(currentEdge.start, fromPoint) < 5 ? currentEdge.end : currentEdge.start;

    // Bu noktada rakip köy/şehir var mı? Varsa zincir kesilir
    const hasEnemyBuilding = this.room.buildings.some(b =>
      (b.type === BuildingType.SETTLEMENT || b.type === BuildingType.CITY) &&
      b.ownerId !== playerId &&
      this.getDistance(this.getVertexPixelPos(b.coord.q, b.coord.r, b.coord.vertexIndex!), otherPoint) < 5
    );

    if (hasEnemyBuilding) {
      return 1; // Bu yol sayılır ama devam edilmez
    }

    // Bu noktaya bağlı diğer yolları bul
    let maxBranch = 0;
    for (const edge of allEdges) {
      if (visited.has(edge.id)) continue;

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
  private updateLargestArmyHolder() {
    const MIN_ARMY = 3;
    let maxArmy = MIN_ARMY - 1;
    let newHolder: string | null = this.room.largestArmyPlayerId;

    for (const player of this.room.players) {
      if (player.armySize >= MIN_ARMY) {
        // Mevcut sahibi geçmek için DAHA FAZLA olmalı
        if (this.room.largestArmyPlayerId === player.id) {
          // Zaten sahip
          if (player.armySize > maxArmy) {
            maxArmy = player.armySize;
          }
        } else {
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
  private getDistance(p1: { x: number, y: number }, p2: { x: number, y: number }) {
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

  // OYUN BAŞLATMA: 3-5 kişi ile oyun başlar
  // 5 kişi ise büyük harita (radius=3) oluşturulur
  startGame(reqId: string) {
    if (reqId !== this.room.hostId) throw new Error("Sadece Host!");
    if (this.room.players.length < 3 || this.room.players.length > 5) throw new Error("Oyunu başlatmak için 3-5 kişi gerekli!");

    // 5 KİŞİ: Büyük harita oluştur (radius=3, 37 arazi)
    if (this.room.players.length === 5) {
      this.room.tiles = generateMap(3); // Büyük harita
    }

    // Manuel Zar Aşamasına Geç
    this.room.status = GameStatus.ROLLING_FOR_START;
    this.room.startRolls = this.room.players.map(p => ({ playerId: p.id, roll: null }));
    this.room.activePlayerId = this.room.players[0].id; // Host başlar

    return "Zar atma aşaması başladı! Sırayla zar atın.";
  }

  rollStartDice(playerId: string) {
    if (this.room.status !== GameStatus.ROLLING_FOR_START) throw new Error("Şu an başlangıç zarı atılmıyor.");
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");

    const playerRollEntry = this.room.startRolls.find(r => r.playerId === playerId);
    if (!playerRollEntry) throw new Error("Listede yoksun.");
    if (playerRollEntry.roll !== null) throw new Error("Zaten zar attın.");

    // Zar At
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    playerRollEntry.roll = d1 + d2;

    const msg = `${this.room.players.find(p => p.id === playerId)?.name} attı: ${d1 + d2} 🎲`;

    // Herkes attı mı?
    const waitingPlayers = this.room.startRolls.filter(r => r.roll === null);
    if (waitingPlayers.length > 0) {
      // Sıradaki oyuncuya geç
      let nextIdx = (this.room.players.findIndex(p => p.id === playerId) + 1) % this.room.players.length;
      while (true) {
        const nextP = this.room.players[nextIdx];
        const entry = this.room.startRolls.find(r => r.playerId === nextP.id);
        if (entry && entry.roll === null) {
          this.room.activePlayerId = nextP.id;
          break;
        }
        nextIdx = (nextIdx + 1) % this.room.players.length;
      }
      return `${msg}. Sıra sonraki oyuncuda.`;
    } else {
      // HERKES ATTI - KAZANANI BELİRLE
      let maxRoll = -1;
      this.room.startRolls.forEach(r => { if (r.roll! > maxRoll) maxRoll = r.roll!; });

      const winners = this.room.startRolls.filter(r => r.roll === maxRoll);

      if (winners.length === 1) {
        // KAZANAN VAR!
        const winnerId = winners[0].playerId;
        const winnerName = this.room.players.find(p => p.id === winnerId)?.name;

        // Sıralamayı en yüksekten en düşüğe göre güncelle
        const sortedRolls = [...this.room.startRolls].sort((a, b) => (b.roll || 0) - (a.roll || 0));
        const newOrder = sortedRolls.map(r => this.room.players.find(p => p.id === r.playerId)!).filter(Boolean);
        this.room.players = newOrder;

        // Setup Phase Başlat
        this.room.players.forEach(p => p.resources[ResourceType.GOLD] = 3);
        this.room.status = GameStatus.SETUP_ROUND_1;
        this.room.activePlayerId = this.room.players[0].id;
        this.room.turnSubPhase = 'settlement';

        // Start roll verisini temizle
        this.room.startRolls = [];

        return `${msg}. KAZANAN: ${winnerName} (${maxRoll})! Oyun Başlıyor!`;

      } else {
        // EŞİTLİK (TIE)
        const tieNames = winners.map(w => this.room.players.find(p => p.id === w.playerId)?.name).join(', ');

        winners.forEach(w => w.roll = null);

        this.room.activePlayerId = winners[0].playerId;

        return `${msg}. EŞİTLİK! En yüksek (${maxRoll}) atanlar (${tieNames}) tekrar atacak.`;
      }
    }
  }

  // ODA BİLGİSİ: Lobby'de gösterilen oda bilgisi (maxPlayers 5'e çıkarıldı)
  getRoomInfo(): RoomInfo { return { id: this.room.id, name: this.name, playerCount: this.room.players.length, maxPlayers: 5, isLocked: !!this.password, status: this.room.status }; }
  getGameState() { return { ...this.room, devCardDeckCount: this.devCardDeck.length }; }
  removePlayer(id: string) { this.room.players = this.room.players.filter(p => p.id !== id); }
  isEmpty() { return this.room.players.length === 0; }

  // BAN SİSTEMİ
  private bannedIds: Set<string> = new Set();

  banPlayer(requesterId: string, targetId: string): string {
    if (requesterId !== this.room.hostId) throw new Error("Sadece oda sahibi oyuncu atabilir!");
    if (targetId === this.room.hostId) throw new Error("Kendinizi atamazsınız!");
    const target = this.room.players.find(p => p.id === targetId);
    if (!target) throw new Error("Oyuncu bulunamadı!");

    this.bannedIds.add(targetId);
    this.room.players = this.room.players.filter(p => p.id !== targetId);

    // Eğer atılan oyuncu aktif oyuncuysa, sırayı değiştir
    if (this.room.activePlayerId === targetId && this.room.players.length > 0) {
      const currentIndex = 0; // İlk oyuncuya geç
      this.room.activePlayerId = this.room.players[currentIndex].id;
      this.room.turnSubPhase = 'waiting';
    }

    return target.name;
  }

  isBanned(id: string) { return this.bannedIds.has(id); }

  // === TÜCCAR KARTI: Bankadan kaynak seçme ===
  // Tüccar kartı oynanınca trader_pick fazna geçilir
  // Oyuncu 3 kez bu metodu çağırır, her seferinde 1 kaynak seçer
  traderPickResource(playerId: string, resource: ResourceType): string {
    if (this.room.activePlayerId !== playerId) throw new Error("Sıra sende değil!");
    if ((this.room.turnSubPhase as any) !== 'trader_pick') throw new Error("Tüccar modu aktif değil!");
    if (resource === ResourceType.GOLD) throw new Error("Tüccar ile Altın seçemezsin!");

    const player = this.room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Oyuncu bulunamadı");

    // Seçilen kaynağı ver
    player.resources[resource] = (player.resources[resource] || 0) + 1;
    this.room.traderPicksRemaining--;

    // Tüm haklar kullanıldıysa normal moda dön
    if (this.room.traderPicksRemaining <= 0) {
      this.room.turnSubPhase = 'waiting';
      return `Tüccar tamamlandı! Son seçim: +1 ${resource}`;
    }

    return `+1 ${resource} alındı! Kalan seçim: ${this.room.traderPicksRemaining}`;
  }

  // === ADMİN ÖZELLİKLERİ (SADECE HOST) ===
  // Admin kaynak ekleme: Belirtilen oyuncuya kaynak ekler
  // GÜVENLİK: Sadece host kullanabilir
  adminGiveResources(requesterId: string, targetId: string, resources: Partial<Record<ResourceType, number>>): string {
    if (requesterId !== this.room.hostId) throw new Error("Sadece Host bu komutu kullanabilir!");
    const target = this.room.players.find(p => p.id === targetId);
    if (!target) throw new Error("Oyuncu bulunamadı!");

    // Her kaynak için miktarları ekle
    for (const [res, amount] of Object.entries(resources)) {
      if (amount && amount > 0) {
        target.resources[res as ResourceType] = (target.resources[res as ResourceType] || 0) + amount;
      }
    }

    return `Admin: ${target.name}’a kaynak eklendi.`;
  }

  // Admin VP ayarlama: Belirtilen oyuncunun VP puanını ayarlar
  adminSetVP(requesterId: string, targetId: string, vp: number): string {
    if (requesterId !== this.room.hostId) throw new Error("Sadece Host bu komutu kullanabilir!");
    const target = this.room.players.find(p => p.id === targetId);
    if (!target) throw new Error("Oyuncu bulunamadı!");

    target.victoryPoints = Math.max(0, vp);
    return `Admin: ${target.name} VP=${vp} olarak ayarlandı.`;
  }
}