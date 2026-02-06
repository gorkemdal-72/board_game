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
    devCards: DevCardType[];
}
export declare enum PlayerColor {
    RED = "red",
    BLUE = "blue",
    ORANGE = "orange",
    WHITE = "white"
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
    MERCENARY = "Paral\u0131 Asker",// Hırsızı taşır
    SABOTAGE = "Sabotaj",// Yol yıkar
    CARTEL = "Kartel",// Tekelcilik (Ambargo)
    INSURANCE = "Yol Sigortas\u0131",// Sabotajı engeller
    VICTORY_POINT = "Zafer Puan\u0131"
}
