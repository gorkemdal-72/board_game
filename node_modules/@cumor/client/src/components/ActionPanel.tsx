import { useState } from 'react';

interface ActionPanelProps {
  onBuildRoad: () => void;
  onBuildSettlement: () => void;
  onBuildCity: () => void; // EKLENDİ
  onEndTurn: () => void;
  isBuilding: 'road' | 'settlement' | 'city' | null; // GÜNCELLENDİ
  onCancelBuild: () => void;
  onBuyCard: () => void; // EKLENDİ
}

export function ActionPanel({ onBuildRoad, onBuildSettlement, onBuildCity, onEndTurn, isBuilding, onCancelBuild, onBuyCard }: ActionPanelProps) {
  return (
    <div className="absolute right-6 bottom-32 flex flex-col gap-3 z-40">
      
      {isBuilding ? (
        <button 
          onClick={onCancelBuild}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg animate-pulse"
        >
          ❌ İPTAL ET
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <button 
              onClick={onBuildRoad}
              className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
            >
              <span className="text-2xl">🛣️</span>
              <span className="text-xs font-bold">YOL (1🧱 1🌲)</span>
            </button>

            <button 
              onClick={onBuildSettlement}
              className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
            >
              <span className="text-2xl">🏠</span>
              <span className="text-xs font-bold">KÖY (1🧱 1🌲 1🐑 1🌾)</span>
            </button>

            {/* YENİ ŞEHİR BUTONU */}
            <button 
              onClick={onBuildCity}
              className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
            >
              <span className="text-2xl">🏰</span>
              <span className="text-xs font-bold">ŞEHİR (2🌾 3💎)</span>
            </button>

            {/* YENİ: KART ALMA BUTONU */}
            <button 
              onClick={onBuyCard}
              className="bg-purple-700 hover:bg-purple-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
            >
              <span className="text-2xl">🃏</span>
              <span className="text-[10px] font-bold">KART (1💎 1🐑 1🌾)</span>
            </button>
          </div>

          <button 
            onClick={onEndTurn}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl shadow-xl mt-2 border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all"
          >
            TURU BİTİR ⏭️
          </button>
        </>
      )}
    </div>
  );
}