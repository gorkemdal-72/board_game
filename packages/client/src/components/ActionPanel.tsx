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

export function ActionPanelContent({ onBuildRoad, onBuildSettlement, onBuildCity, onEndTurn, isBuilding, onCancelBuild, onBuyCard }: ActionPanelProps) {
  return (
    <>
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
              title="Yol İnşa Et: 1 Beton + 1 Kereste gerekir. Yollar köyleri birbirine bağlar."
            >
              <span className="text-2xl">🛣️</span>
              <span className="text-xs font-bold">YOL (1🧱 1🌲)</span>
            </button>

            <button
              onClick={onBuildSettlement}
              className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
              title="Köy Kur: 1 Beton + 1 Kereste + 1 Tekstil + 1 Gıda. Her köy +1 VP ve kaynak üretir."
            >
              <span className="text-2xl">🏠</span>
              <span className="text-xs font-bold">KÖY (1🧱 1🌲 1🐑 1🌾)</span>
            </button>

            {/* ŞEHİR BUTONU */}
            <button
              onClick={onBuildCity}
              className="bg-slate-700 hover:bg-slate-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
              title="Köyü Şehre Yükselt: 2 Gıda + 3 Elmas. Şehir +2 VP ve çift kaynak üretir."
            >
              <span className="text-2xl">🏰</span>
              <span className="text-xs font-bold">ŞEHİR (2🌾 3💎)</span>
            </button>

            {/* KART ALMA BUTONU */}
            <button
              onClick={onBuyCard}
              className="bg-purple-700 hover:bg-purple-600 text-white p-4 rounded-xl shadow-lg flex flex-col items-center gap-1 border border-slate-600 transition-all hover:scale-105"
              title="Gelişim Kartı Satın Al: 1 Elmas + 1 Tekstil + 1 Gıda. Kartlar sıradaki turda kullanılabilir."
            >
              <span className="text-2xl">🃏</span>
              <span className="text-[10px] font-bold">KART (1💎 1🐑 1🌾)</span>
            </button>
          </div>

          <button
            onClick={onEndTurn}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl shadow-xl mt-2 border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all"
            title="Turunu bitir ve sırayı sonraki oyuncuya ver."
          >
            TURU BİTİR ⏭️
          </button>
        </>
      )}
    </>
  );
}

export function ActionPanel(props: ActionPanelProps) {
  return (
    <div className="hidden md:flex absolute right-6 bottom-32 flex-col gap-3 z-40">
      <ActionPanelContent {...props} />
    </div>
  );
}

export function MobileActionPanel(props: ActionPanelProps) {
  return (
    <div className="md:hidden fixed bottom-20 left-0 w-full flex flex-col gap-3 z-50 items-center pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-center gap-2">
        <ActionPanelContent {...props} />
      </div>
    </div>
  );
}