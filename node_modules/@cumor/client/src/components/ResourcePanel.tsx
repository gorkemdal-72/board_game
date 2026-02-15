import { ResourceType, DevCardType } from '@cumor/shared';

// ... (Icon ve Name sabitleri aynen kalsın) ...
const RESOURCE_ICONS: Record<ResourceType, string> = {
  [ResourceType.LUMBER]: '🌲',
  [ResourceType.CONCRETE]: '🧱',
  [ResourceType.TEXTILE]: '🧵',
  [ResourceType.FOOD]: '🌾',
  [ResourceType.DIAMOND]: '💎',
  [ResourceType.GOLD]: '💰'
};

const RESOURCE_NAMES: Record<ResourceType, string> = {
  [ResourceType.LUMBER]: 'Kereste',
  [ResourceType.CONCRETE]: 'Beton',
  [ResourceType.TEXTILE]: 'Tekstil',
  [ResourceType.FOOD]: 'Gıda',
  [ResourceType.DIAMOND]: 'Elmas',
  [ResourceType.GOLD]: 'Altın'
};

const CARD_ICONS: Record<DevCardType, string> = {
  [DevCardType.MERCENARY]: '⚔️',
  [DevCardType.SABOTAGE]: '💣',
  [DevCardType.CARTEL]: '🏢',
  [DevCardType.INSURANCE]: '🛡️',
  [DevCardType.VICTORY_POINT]: '🏆',
  [DevCardType.ENGINEER]: '🛣️',
  [DevCardType.TRADER]: '📦',
  [DevCardType.MERCATOR]: '🌍'
};

const CARD_NAMES: Record<DevCardType, string> = {
  [DevCardType.MERCENARY]: 'Asker',
  [DevCardType.SABOTAGE]: 'Sabotaj',
  [DevCardType.CARTEL]: 'Kartel',
  [DevCardType.INSURANCE]: 'Sigorta',
  [DevCardType.VICTORY_POINT]: 'Zafer P.',
  [DevCardType.ENGINEER]: 'Mühendis',
  [DevCardType.TRADER]: 'Tüccar',
  [DevCardType.MERCATOR]: 'Mercator'
};

// Kart açıklamaları (tooltip için)
const CARD_TOOLTIPS: Record<DevCardType, string> = {
  [DevCardType.MERCENARY]: 'Vergi Memurunu taşı + vergi adam olmak için 3 tane açman gerekiyor',
  [DevCardType.SABOTAGE]: 'Haritadaki bir rakip yolu yok et',
  [DevCardType.CARTEL]: 'Bir kaynağı tekelini. Rakipler sana öder',
  [DevCardType.INSURANCE]: 'Sonraki 7 zaranda kaynak kaybetmezsin',
  [DevCardType.VICTORY_POINT]: 'Anında +1 Zafer Puanı',
  [DevCardType.ENGINEER]: 'Ücretsiz 2 yol inşa et',
  [DevCardType.TRADER]: 'Bankadan 3 kaynak çek (altın hariç)',
  [DevCardType.MERCATOR]: 'Her rakipten max 2 kaynak al (ceza sistemli)'
};

interface ResourcePanelProps {
  resources: Record<ResourceType, number>;
  devCards: Record<DevCardType, number>;
  onPlayCard: (card: DevCardType) => void; // YENİ PROP
  isMyTurn: boolean; // YENİ: Sadece sıra bizdeyse oynayabilelim
}

export function ResourcePanel({ resources, devCards, onPlayCard, isMyTurn }: ResourcePanelProps) {
  return (
    <div className="fixed bottom-1 left-1/2 -translate-x-1/2 flex gap-4 z-50 items-end">

      {/* KAYNAKLAR */}
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 p-3 rounded-2xl shadow-2xl flex gap-4 h-24 items-center">
        {Object.values(ResourceType).map(type => (
          <div key={type} className="flex flex-col items-center min-w-[50px]" title={`${RESOURCE_NAMES[type]}: ${resources[type]} adet`}>
            <div className="text-2xl mb-1">{RESOURCE_ICONS[type]}</div>
            <div className={`font-black text-lg ${type === ResourceType.GOLD ? 'text-yellow-400' : 'text-white'}`}>
              {resources[type]}
            </div>
          </div>
        ))}
      </div>

      {/* KARTLAR */}
      <div className="bg-purple-900/95 backdrop-blur-md border border-purple-500 p-3 rounded-2xl shadow-2xl flex gap-3 h-28 items-start">
        {Object.values(DevCardType).map(type => {
          const count = devCards ? devCards[type] || 0 : 0;
          if (count === 0) return null;

          return (
            <div key={type} className="flex flex-col items-center justify-between h-full min-w-[50px]">
              <div className="flex flex-col items-center">
                <div className="text-2xl mb-1">{CARD_ICONS[type]}</div>
                <div className="font-black text-white text-sm bg-purple-700 rounded-full w-5 h-5 flex items-center justify-center -mt-2 border border-purple-400">
                  {count}
                </div>
              </div>

              {/* OYNA BUTONU (Sıra Bendeyse) */}
              {isMyTurn && (
                <button
                  onClick={() => onPlayCard(type)}
                  className="bg-green-500 hover:bg-green-400 text-white text-[10px] font-bold py-1 px-2 rounded shadow transition-colors mt-1"
                  title={CARD_TOOLTIPS[type] || 'Kartı kullan'}
                >
                  KULLAN
                </button>
              )}
            </div>
          );
        })}
        {(!devCards || Object.values(devCards).every(v => v === 0)) && (
          <div className="text-xs text-purple-300 font-bold self-center px-2">KART YOK</div>
        )}
      </div>

    </div>
  );
}