// packages/shared/src/types.ts
export var ResourceType;
(function (ResourceType) {
    ResourceType["LUMBER"] = "lumber";
    ResourceType["CONCRETE"] = "concrete";
    ResourceType["TEXTILE"] = "textile";
    ResourceType["FOOD"] = "food";
    ResourceType["DIAMOND"] = "diamond";
    ResourceType["GOLD"] = "gold"; // YENİ: Altın (Para Birimi)
})(ResourceType || (ResourceType = {}));
export var TerrainType;
(function (TerrainType) {
    TerrainType["FOREST"] = "forest";
    TerrainType["HILLS"] = "hills";
    TerrainType["PASTURE"] = "pasture";
    TerrainType["FIELDS"] = "fields";
    TerrainType["MOUNTAINS"] = "mountains";
    TerrainType["DESERT"] = "desert"; // Üretim Yok
})(TerrainType || (TerrainType = {}));
export var BuildingType;
(function (BuildingType) {
    BuildingType["ROAD"] = "road";
    BuildingType["SETTLEMENT"] = "settlement";
    BuildingType["CITY"] = "city";
    BuildingType["DEBRIS"] = "debris"; // Yıkıntı
})(BuildingType || (BuildingType = {}));
export var GameStatus;
(function (GameStatus) {
    GameStatus["LOBBY"] = "lobby";
    GameStatus["SETUP_ROUND_1"] = "setup_round_1";
    GameStatus["SETUP_ROUND_2"] = "setup_round_2";
    GameStatus["PLAYING"] = "playing";
    GameStatus["FINISHED"] = "finished";
    GameStatus["ROLLING_FOR_START"] = "rolling_for_start";
})(GameStatus || (GameStatus = {}));
export var PlayerColor;
(function (PlayerColor) {
    PlayerColor["RED"] = "red";
    PlayerColor["BLUE"] = "blue";
    PlayerColor["ORANGE"] = "orange";
    PlayerColor["WHITE"] = "white";
})(PlayerColor || (PlayerColor = {}));
export var DevCardType;
(function (DevCardType) {
    DevCardType["MERCENARY"] = "Paral\u0131 Asker";
    DevCardType["SABOTAGE"] = "Sabotaj";
    DevCardType["CARTEL"] = "Kartel";
    DevCardType["INSURANCE"] = "Yol Sigortas\u0131";
    DevCardType["VICTORY_POINT"] = "Zafer Puan\u0131"; // +1 Puan
})(DevCardType || (DevCardType = {}));
