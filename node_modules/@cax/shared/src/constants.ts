// packages/shared/src/constants.ts

// 1. Tipleri types.ts dosyasından alıyoruz (Import ediyoruz, export etmiyoruz)
import { TerrainType } from './types.js'; 

// 2. Sabit Değerler (Constants)
export const TILE_SIZE = 60;

// Arazi Renkleri Haritası
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.FOREST]: '#228B22',   // Orman Yeşili
  [TerrainType.HILLS]: '#D2691E',    // Kiremit Rengi
  [TerrainType.PASTURE]: '#90EE90',  // Açık Yeşil
  [TerrainType.FIELDS]: '#FFD700',   // Altın Sarısı
  [TerrainType.MOUNTAINS]: '#808080',// Gri
  [TerrainType.DESERT]: '#F4A460'    // Kum Rengi
};

// Axial Yönler (Haritada komşuları bulmak için)
export const AXIAL_DIRECTIONS = [
  { q: 1, r: 0 },   // Doğu
  { q: 1, r: -1 },  // Kuzeydoğu
  { q: 0, r: -1 },  // Kuzeybatı
  { q: -1, r: 0 },  // Batı
  { q: -1, r: 1 },  // Güneybatı
  { q: 0, r: 1 }    // Güneydoğu
] as const;