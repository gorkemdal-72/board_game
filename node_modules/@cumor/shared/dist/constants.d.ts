import { TerrainType } from './types.js';
export declare const TILE_SIZE = 60;
export declare const TERRAIN_COLORS: Record<TerrainType, string>;
export declare const AXIAL_DIRECTIONS: readonly [{
    readonly q: 1;
    readonly r: 0;
}, {
    readonly q: 1;
    readonly r: -1;
}, {
    readonly q: 0;
    readonly r: -1;
}, {
    readonly q: -1;
    readonly r: 0;
}, {
    readonly q: -1;
    readonly r: 1;
}, {
    readonly q: 0;
    readonly r: 1;
}];
