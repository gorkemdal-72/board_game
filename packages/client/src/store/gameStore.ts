// packages/client/src/store/gameStore.ts
import { create } from 'zustand';
import { HexCoord } from '@cax/shared'; // Paket isminiz farklıysa düzeltin (@cax-game/shared vb.)

interface GameStore {
  hoveredHex: HexCoord | null;
  selectedHex: HexCoord | null;

  setHoveredHex: (hex: HexCoord | null) => void;
  setSelectedHex: (hex: HexCoord | null) => void; 
}

export const useGameStore = create<GameStore>((set) => ({
  hoveredHex: null,
  selectedHex: null,

  setHoveredHex: (hex) => set({ hoveredHex: hex }),
  setSelectedHex: (hex) => set({ selectedHex: hex }), 
}));