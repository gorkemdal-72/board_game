// packages/shared/src/types.ts

export enum ResourceType {
  LUMBER = 'lumber',     // Kereste (Orman)
  CONCRETE = 'concrete', // Beton (Tuğla yerine)
  TEXTILE = 'textile',   // Tekstil (Yün yerine)
  FOOD = 'food',         // Gıda (Tahıl yerine)
  DIAMOND = 'diamond',   // Elmas (Cevher yerine)
  GOLD = 'gold'          // YENİ: Altın (Para Birimi)
}

export enum TerrainType {
  FOREST = 'forest',     // Üretim: Kereste
  HILLS = 'hills',       // Üretim: Beton
  PASTURE = 'pasture',   // Üretim: Tekstil
  FIELDS = 'fields',     // Üretim: Gıda
  MOUNTAINS = 'mountains', // Üretim: Elmas
  DESERT = 'desert'      // Üretim Yok
}

export enum BuildingType {
  ROAD = 'road',
  SETTLEMENT = 'settlement', // Köy
  CITY = 'city',          // Şehir
  DEBRIS = 'debris'  // Yıkıntı
}

export enum GameStatus {
  LOBBY = 'lobby',
  SETUP_ROUND_1 = 'setup_round_1',
  SETUP_ROUND_2 = 'setup_round_2',
  PLAYING = 'playing',
  FINISHED = 'finished',
  ROLLING_FOR_START = 'rolling_for_start'
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  resources: Record<ResourceType, number>; // Kaynaklar + Altın
  victoryPoints: number;
  longestRoad: number;
  armySize: number;
  devCards: Record<DevCardType, number>;
  newDevCards: Record<DevCardType, number>; // Yeni alınanlar (bu tur kullanılamaz)
}

export enum PlayerColor {
  RED = 'red',
  BLUE = 'blue',
  ORANGE = 'orange',
  WHITE = 'white',
  GREEN = '#2ecc71',
  PURPLE = '#9b59b6',
  PINK = '#e91e63',
  CYAN = '#00bcd4'
}

export interface Coord {
  q: number;
  r: number;
  vertexIndex?: number;
  edgeIndex?: number;
}

export interface Tile {
  coord: { q: number; r: number };
  terrain: TerrainType;
  number: number | null;
  hasRobber: boolean; // Vergi Memuru
}

export interface Building {
  id: string;
  type: BuildingType;
  ownerId: string;
  coord: Coord;
  originalOwnerId?: string; // Enkaz için orijinal sahip (tamir maliyeti hesabı)
}

export interface GameState {
  id: string;
  tiles: Tile[];
  players: Player[];
  buildings: Building[];
  status: GameStatus;
  activePlayerId: string | null;
  hostId: string | null;
  turnSubPhase: 'settlement' | 'road' | 'waiting';
  setupTurnIndex: number;
  currentTradeOffer: TradeOffer | null;

  // CUMOR: Yeni Alanlar
  winnerId: string | null;              // Kazanan oyuncu
  longestRoadPlayerId: string | null;   // En Uzun Yol sahibi (+2 VP)
  largestArmyPlayerId: string | null;   // En Güçlü Ordu sahibi (+2 VP)
  activeCartelPlayerId: string | null;  // Kartel aktif mi? Kimde?
  startRolls: { playerId: string, roll: number | null }[]; // Başlangıç zarları

  // YENİ: Gelişim Kartı Özel Fazları
  freeRoadsRemaining: number;           // Mühendis kartı: Kalan ücretsiz yol hakkı
  traderPicksRemaining: number;         // Tüccar kartı: Kalan kaynak seçme hakkı
}

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  isLocked: boolean;
  status: GameStatus;
}

//  Ticaret Teklifi Yapısı
export interface TradeOffer {
  id: string;
  offererId: string; // Teklifi yapan kim?
  give: Record<ResourceType, number>; // Ne veriyor?
  want: Record<ResourceType, number>; // Ne istiyor?
  acceptors: string[]; // Kimler "Tamam" dedi?
}

export enum DevCardType {
  MERCENARY = 'Vergi Memuru', // Hırsızı taşır + Ordu büyütür
  SABOTAGE = 'Sabotaj',       // Rakip yol yıkar, enkaz bırakır
  CARTEL = 'Kartel',          // Tüm kaynaklar sana gelir (1 tur)
  INSURANCE = 'Yol Sigortası',// Sabotajı otomatik engeller
  VICTORY_POINT = 'Zafer Puanı', // +1 Puan (oynanmaz, otomatik sayılır)
  ENGINEER = 'Mühendis',      // YENİ: Ücretsiz 2 yol yapma hakkı
  TRADER = 'Tüccar',          // YENİ: Bankadan istediğin 3 kaynağı bedava al
  MERCATOR = 'Mercator'       // YENİ: Bir kaynak türü söyle, rakiplerden max 2 al (yoksa altın ceza)
}

