import React, { useState } from 'react';
import { Tile, hexToPixel, getHexCorners, Building, Player } from '@cax/shared';

const HEX_SIZE = 50;
const HEX_DRAW_SIZE = 52;

// MERCATOR TEMASI RENKLERİ [cite: 11, 12, 13, 14, 15, 16]
const UI_COLORS: Record<string, string> = {
  forest: '#27ae60',    // Kereste (Koyu Yeşil)
  hills: '#d35400',     // Beton (Turuncu/Kiremit)
  pasture: '#1a1cad',   // Tekstil (Açık Yeşil)
  fields: '#f1c40f',    // Gıda (Sarı)
  mountains: '#8e44ad', // Elmas (Mor)
  desert: '#95a5a6'     // Çöl (Gri)
};

interface HexBoardProps {
  tiles: Tile[];
  buildings?: Building[];
  players?: Player[];
  onVertexClick?: (q: number, r: number, vertexIndex: number) => void;
  onEdgeClick?: (q: number, r: number, edgeIndex: number) => void;
  onTileClick?: (q: number, r: number) => void;
}

export function HexBoard({ tiles, buildings = [], players = [], onVertexClick, onEdgeClick, onTileClick }: HexBoardProps) {
  const [hoveredVertex, setHoveredVertex] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const renderedVertices = new Set<string>();
  const renderedEdges = new Set<string>();

  return (
    <div className="flex items-center justify-center">
      {/* ViewBox ayarlandı, harita ortalandı */}
      <svg width="800" height="800" viewBox="-250 -250 500 500"
        className="bg-[#1e293b] border-[12px] border-[#0f172a] rounded-[3rem] shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-visible">
        <g>
          {/* 1. ARAZİLER */}
          {tiles.map((tile, index) => (
            <g key={`hex-${index}`} onClick={() => onTileClick && onTileClick(tile.coord.q, tile.coord.r)} className="cursor-pointer hover:opacity-90">
              <HexTile tile={tile} xSize={HEX_SIZE} drawSize={HEX_DRAW_SIZE} />
            </g>
          ))}

          {/* 2. YOLLAR VE KENARLAR */}
          {tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
            const corners = getHexCorners(x, y, HEX_SIZE);
            return corners.map((corner, i) => {
              const nextCorner = corners[(i + 1) % 6];
              const edgeKey = [`${Math.round(corner.x)},${Math.round(corner.y)}`, `${Math.round(nextCorner.x)},${Math.round(nextCorner.y)}`].sort().join('|');
              if (renderedEdges.has(edgeKey)) return null;
              renderedEdges.add(edgeKey);
              const midX = (corner.x + nextCorner.x) / 2;
              const midY = (corner.y + nextCorner.y) / 2;
              const angle = Math.atan2(nextCorner.y - corner.y, nextCorner.x - corner.x) * (180 / Math.PI);
              const edgeId = `edge-${tile.coord.q}-${tile.coord.r}-${i}`;

              // HATA ÇÖZÜMÜ: Optional Chaining yerine boolean kontrol
              const hasRoad = buildings.some(b => b.type === 'road' && b.coord.q === tile.coord.q && b.coord.r === tile.coord.r && b.coord.edgeIndex === i);

              return (
                <g key={edgeKey} transform={`translate(${midX}, ${midY}) rotate(${angle})`}
                  onClick={() => !hasRoad && onEdgeClick && onEdgeClick(tile.coord.q, tile.coord.r, i)}
                  onMouseEnter={() => setHoveredEdge(edgeId)} onMouseLeave={() => setHoveredEdge(null)} className="cursor-pointer">
                  <rect x={-20} y={-10} width={40} height={20} fill="transparent" />
                  {hoveredEdge === edgeId && !hasRoad && (
                    <rect x={-18} y={-3} width={36} height={6} fill="white" rx={3} className="opacity-50" />
                  )}
                </g>
              );
            });
          })}

          {/* 3. KÖYLER VE KÖŞELER */}
          {tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.coord.q, tile.coord.r, HEX_SIZE);
            const corners = getHexCorners(x, y, HEX_SIZE);
            return corners.map((corner, i) => {
              const vKey = `${Math.round(corner.x)},${Math.round(corner.y)}`;
              if (renderedVertices.has(vKey)) return null;
              renderedVertices.add(vKey);
              const vId = `${tile.coord.q}-${tile.coord.r}-${i}`;
              const existingBuilding = buildings.find(b =>
                (b.type === 'settlement' || b.type === 'city') &&
                b.coord.q === tile.coord.q &&
                b.coord.r === tile.coord.r &&
                b.coord.vertexIndex === i
              );
              const hasBuilding = !!existingBuilding;
              return (
                <g key={vKey} onClick={() => onVertexClick && onVertexClick(tile.coord.q, tile.coord.r, i)}>
                  <circle cx={corner.x} cy={corner.y} r={14} fill="transparent" className="cursor-pointer"
                    onMouseEnter={() => setHoveredVertex(vId)} onMouseLeave={() => setHoveredVertex(null)} />
                  {hoveredVertex === vId && !hasBuilding && (
                    <circle cx={corner.x} cy={corner.y} r={7} fill="white" className="opacity-80 pointer-events-none" />
                  )}
                </g>
              );
            });
          })}

          {/* 4. BİNALAR (HATA ÇÖZÜMÜ BURADA) */}
          {buildings.map((b) => {
            const { x, y } = hexToPixel(b.coord.q, b.coord.r, HEX_SIZE);
            const corners = getHexCorners(x, y, HEX_SIZE);
            const owner = players.find(p => p.id === b.ownerId);
            const color = owner?.color || 'gray';

            if (b.type === 'settlement') {
              if (b.coord.vertexIndex === undefined) return null;
              const c = corners[b.coord.vertexIndex];
              return (
                <g key={b.id} transform={`translate(${c.x}, ${c.y})`}>
                  <circle r={9} fill="rgba(0,0,0,0.4)" filter="blur(2px)" />
                  <path d="M -10 0 L -10 -10 L 0 -18 L 10 -10 L 10 0 Z" fill={color} stroke="white" strokeWidth={2} />
                </g>
              );
            }

            // ŞEHİR ÇİZİMİ (YENİ)
            if (b.type === 'city') {
              if (b.coord.vertexIndex === undefined) return null;
              const c = corners[b.coord.vertexIndex];
              return (
                <g key={b.id} transform={`translate(${c.x}, ${c.y})`}>
                  <circle r={12} fill="rgba(0,0,0,0.5)" filter="blur(3px)" />
                  {/* Daha büyük, çift katmanlı yapı */}
                  <rect x={-12} y={-8} width={24} height={16} fill={color} stroke="white" strokeWidth={2} rx={2} />
                  <path d="M -12 -8 L 0 -18 L 12 -8" fill={color} stroke="white" strokeWidth={2} />
                  {/* Kule */}
                  <rect x={-4} y={-22} width={8} height={6} fill={color} stroke="white" strokeWidth={1} />
                </g>
              );
            }

            if (b.type === 'road') {
              // HATA ÇÖZÜMÜ: Undefined kontrolü
              if (b.coord.edgeIndex === undefined) return null;
              const c1 = corners[b.coord.edgeIndex];
              const c2 = corners[(b.coord.edgeIndex + 1) % 6];
              const midX = (c1.x + c2.x) / 2;
              const midY = (c1.y + c2.y) / 2;
              const angle = Math.atan2(c2.y - c1.y, c2.x - c1.x) * (180 / Math.PI);
              return (
                <g key={b.id} transform={`translate(${midX}, ${midY}) rotate(${angle})`}>
                  <rect x={-20} y={-2} width={40} height={8} fill="rgba(0,0,0,0.4)" rx={2} filter="blur(1px)" />
                  <rect x={-22} y={-4} width={44} height={8} fill={color} stroke="white" strokeWidth={1.5} rx={2} />
                </g>
              );
            }

            // ENKAZ ÇİZİMİ (Tıklanabilir)
            if (b.type === 'debris') {
              if (b.coord.edgeIndex === undefined) return null;
              const c1 = corners[b.coord.edgeIndex];
              const c2 = corners[(b.coord.edgeIndex + 1) % 6];
              const midX = (c1.x + c2.x) / 2;
              const midY = (c1.y + c2.y) / 2;
              const angle = Math.atan2(c2.y - c1.y, c2.x - c1.x) * (180 / Math.PI);

              return (
                <g key={b.id} transform={`translate(${midX}, ${midY}) rotate(${angle})`}
                  onClick={() => onEdgeClick && onEdgeClick(b.coord.q, b.coord.r, b.coord.edgeIndex!)}
                  className="cursor-pointer hover:opacity-80">
                  {/* Yanmış/Yıkılmış Yol Efekti */}
                  <rect x={-22} y={-5} width={44} height={10} fill="#1a1a1a" stroke="#ff6b6b" strokeWidth={2} strokeDasharray="4,2" rx={2} />
                  <text x={0} y={4} textAnchor="middle" fontSize="10">🚧</text>
                </g>
              );
            }

            return null;
          })}
        </g>
      </svg>
    </div>
  );
}

function HexTile({ tile, xSize, drawSize }: { tile: Tile; xSize: number; drawSize: number }) {
  const { x, y } = hexToPixel(tile.coord.q, tile.coord.r, xSize);
  const corners = getHexCorners(0, 0, drawSize);
  const points = corners.map(c => `${c.x},${c.y}`).join(' ');
  const terrainKey = String(tile.terrain).toLowerCase();
  const isRedNumber = tile.number === 6 || tile.number === 8;
  const numberColor = isRedNumber ? '#fff' : '#2d3436';
  const numberBg = isRedNumber ? '#e74c3c' : '#f5f6fa';
  const getPips = (n: number) => "•".repeat(6 - Math.abs(7 - n));

  // Basit renkler ve isimler
  const TERRAIN_STYLES: Record<string, { color: string, name: string }> = {
    forest: { color: '#27ae60', name: 'KERESTE' },
    hills: { color: '#d35400', name: 'BETON' },
    pasture: { color: '#2980b9', name: 'TEKSTİL' },
    fields: { color: '#f39c12', name: 'GIDA' },
    mountains: { color: '#8e44ad', name: 'ELMAS' },
    desert: { color: '#95a5a6', name: 'ÇÖL' },
  };

  const style = TERRAIN_STYLES[terrainKey] || TERRAIN_STYLES.desert;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Altıgen Arazi */}
      <polygon
        points={points}
        fill={style.color}
        stroke="#1a1a2e"
        strokeWidth={2}
      />

      {/* Kaynak Adı - ALTTA */}
      <text y={30} textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" stroke="#1a1a2e" strokeWidth={0.4} style={{ pointerEvents: 'none' }}>
        {style.name}
      </text>

      {/* Zar Sayısı */}
      {tile.number && (
        <g>
          <circle r={16} fill={numberBg} stroke="#2d3436" strokeWidth={2} />
          <text y={5} textAnchor="middle" fontSize="14" fontWeight="900" fill={numberColor} style={{ pointerEvents: 'none', fontFamily: 'sans-serif' }}>
            {tile.number}
          </text>
          <text y={13} textAnchor="middle" fontSize="6" fill={isRedNumber ? '#fff' : '#636e72'} style={{ pointerEvents: 'none' }}>
            {getPips(tile.number)}
          </text>
        </g>
      )}

      {/* VERGİ MEMURU - Uncle Sam */}
      {tile.hasRobber && (
        <g>
          <clipPath id="robber-clip">
            <circle r={17} />
          </clipPath>
          <circle r={17} fill="rgba(0,0,0,0.9)" stroke="#c0392b" strokeWidth={3} />
          <image
            href="/robber.png"
            x={-40}
            y={-37}
            width={100}
            height={70}
            clipPath="url(#robber-clip)"
            style={{ pointerEvents: 'none' }}
          />
        </g>
      )}
    </g>
  );
}