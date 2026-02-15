export declare enum ResourceType {
    LUMBER = "lumber",// Kereste (Orman)
    CONCRETE = "concrete",// Beton (Tuğla yerine)
    TEXTILE = "textile",// Tekstil (Yün yerine)
    FOOD = "food",// Gıda (Tahıl yerine)
    DIAMOND = "diamond",// Elmas (Cevher yerine)
    GOLD = "gold"
}
export declare enum TerrainType {
    FOREST = "forest",// Üretim: Kereste
    HILLS = "hills",// Üretim: Beton
    PASTURE = "pasture",// Üretim: Tekstil
    FIELDS = "fields",// Üretim: Gıda
    MOUNTAINS = "mountains",// Üretim: Elmas
    DESERT = "desert"
}
export declare enum BuildingType {
    ROAD = "road",
    SETTLEMENT = "settlement",// Köy
    CITY = "city",// Şehir
    DEBRIS = "debris"
}
export declare enum GameStatus {
    LOBBY = "lobby",
    SETUP_ROUND_1 = "setup_round_1",
    SETUP_ROUND_2 = "setup_round_2",
    PLAYING = "playing",
    FINISHED = "finished",
    ROLLING_FOR_START = "rolling_for_start"
}
export interface Player {
    id: string;
    name: string;
    color: PlayerColor;
    resources: Record<ResourceType, number>;
    victoryPoints: number;
    longestRoad: number;
    armySize: number;
    devCards: Record<DevCardType, number>;
    newDevCards: Record<DevCardType, number>;
}
export declare enum PlayerColor {
    RED = "red",
    BLUE = "blue",
    ORANGE = "orange",
    WHITE = "white",
    GREEN = "#2ecc71",
    PURPLE = "#9b59b6",
    PINK = "#e91e63",
    CYAN = "#00bcd4"
}
export interface Coord {
    q: number;
    r: number;
    vertexIndex?: number;
    edgeIndex?: number;
}
export interface Tile {
    coord: {
        q: number;
        r: number;
    };
    terrain: TerrainType;
    number: number | null;
    hasRobber: boolean;
}
export interface Building {
    id: string;
    type: BuildingType;
    ownerId: string;
    coord: Coord;
    originalOwnerId?: string;
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
    winnerId: string | null;
    longestRoadPlayerId: string | null;
    largestArmyPlayerId: string | null;
    activeCartelPlayerId: string | null;
    startRolls: {
        playerId: string;
        roll: number | null;
    }[];
    freeRoadsRemaining: number;
    traderPicksRemaining: number;
    devCardDeckCount?: number;
}
export interface RoomInfo {
    id: string;
    name: string;
    playerCount: number;
    maxPlayers: number;
    isLocked: boolean;
    status: GameStatus;
}
export interface TradeOffer {
    id: string;
    offererId: string;
    give: Record<ResourceType, number>;
    want: Record<ResourceType, number>;
    acceptors: string[];
}
export declare enum DevCardType {
    MERCENARY = "Vergi Memuru",// Hırsızı taşır + Ordu büyütür
    SABOTAGE = "Sabotaj",// Rakip yol yıkar, enkaz bırakır
    CARTEL = "Kartel",// Tüm kaynaklar sana gelir (1 tur)
    INSURANCE = "Yol Sigortas\u0131",// Sabotajı otomatik engeller
    VICTORY_POINT = "Zafer Puan\u0131",// +1 Puan (oynanmaz, otomatik sayılır)
    ENGINEER = "M\u00FChendis",// YENİ: Ücretsiz 2 yol yapma hakkı
    TRADER = "T\u00FCccar",// YENİ: Bankadan istediğin 3 kaynağı bedava al
    MERCATOR = "Mercator"
}
