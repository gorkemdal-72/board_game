import React from 'react';
import { ResourceType, BuildingType } from '@cax/shared';

// İnşaat Maliyetleri (MERCATOR Kurallarına göre)
const BUILDING_COSTS: Record<string, Record<ResourceType, number>> = {
    [BuildingType.ROAD]: {
        [ResourceType.LUMBER]: 1,
        [ResourceType.CONCRETE]: 1,
        [ResourceType.GOLD]: 0,
        [ResourceType.TEXTILE]: 0,
        [ResourceType.FOOD]: 0,
        [ResourceType.DIAMOND]: 0,
    },
    [BuildingType.SETTLEMENT]: {
        [ResourceType.LUMBER]: 1,
        [ResourceType.CONCRETE]: 1,
        [ResourceType.GOLD]: 0,
        [ResourceType.TEXTILE]: 1,
        [ResourceType.FOOD]: 1,
        [ResourceType.DIAMOND]: 0,
    },
    [BuildingType.CITY]: {
        [ResourceType.GOLD]: 0,
        [ResourceType.LUMBER]: 0,
        [ResourceType.CONCRETE]: 3,
        [ResourceType.TEXTILE]: 0,
        [ResourceType.FOOD]: 2,
        [ResourceType.DIAMOND]: 0,
    },
    'devCard': {
        [ResourceType.GOLD]: 0,
        [ResourceType.LUMBER]: 0,
        [ResourceType.CONCRETE]: 0,
        [ResourceType.TEXTILE]: 1,
        [ResourceType.FOOD]: 1,
        [ResourceType.DIAMOND]: 1,
    },
};

// Kaynak ikonları
const RESOURCE_ICONS: Record<ResourceType, string> = {
    [ResourceType.LUMBER]: '🪵',
    [ResourceType.CONCRETE]: '🧱',
    [ResourceType.TEXTILE]: '🧵',
    [ResourceType.FOOD]: '🌾',
    [ResourceType.DIAMOND]: '💎',
    [ResourceType.GOLD]: '🪙',
};

interface BuildCostPanelProps {
    playerResources: Record<ResourceType, number>;
    buildingCounts: {
        settlements: number;
        cities: number;
        roads: number;
    };
}

export function BuildCostPanel({ playerResources, buildingCounts }: BuildCostPanelProps) {
    // Kaynak yeterli mi kontrol et
    const canAfford = (buildingType: string) => {
        const cost = BUILDING_COSTS[buildingType];
        if (!cost) return false;
        return Object.entries(cost).every(([res, amount]) =>
            playerResources[res as ResourceType] >= amount
        );
    };

    // Maksimum bina sayıları
    const MAX_SETTLEMENTS = 5;
    const MAX_CITIES = 4;
    const MAX_ROADS = 15;

    const buildings = [
        {
            type: BuildingType.ROAD,
            name: 'Yol',
            icon: '🛤️',
            limit: MAX_ROADS,
            count: buildingCounts.roads
        },
        {
            type: BuildingType.SETTLEMENT,
            name: 'Köy',
            icon: '🏠',
            limit: MAX_SETTLEMENTS,
            count: buildingCounts.settlements
        },
        {
            type: BuildingType.CITY,
            name: 'Şehir',
            icon: '🏰',
            limit: MAX_CITIES,
            count: buildingCounts.cities
        },
        {
            type: 'devCard',
            name: 'Kart',
            icon: '🃏',
            limit: null,
            count: null
        },
    ];

    return (
        <div className=" fixed right-1 top-25 bg-slate-800/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-3 w-64">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 text-center">
                📋 İnşaat Maliyetleri
            </h3>

            <div className="space-y-2">
                {buildings.map((building) => {
                    const cost = BUILDING_COSTS[building.type];
                    const affordable = canAfford(building.type);
                    const atLimit = building.limit !== null && building.count !== null && building.count >= building.limit;

                    return (
                        <div
                            key={building.type}
                            className={`rounded-lg p-2 border transition-all ${atLimit
                                    ? 'bg-red-900/20 border-red-700/30 opacity-60'
                                    : affordable
                                        ? 'bg-green-900/20 border-green-700/30'
                                        : 'bg-slate-700/30 border-slate-600/30'
                                }`}
                        >
                            {/* Başlık Satırı */}
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{building.icon}</span>
                                    <span className="font-bold text-white text-sm">{building.name}</span>
                                </div>

                                {/* Limit Göstergesi */}
                                {building.limit !== null && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${atLimit ? 'bg-red-500 text-white' : 'bg-slate-600 text-gray-300'
                                        }`}>
                                        {building.count}/{building.limit}
                                    </span>
                                )}
                            </div>

                            {/* Maliyet Satırı */}
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(cost).map(([res, amount]) => {
                                    if (amount === 0) return null;
                                    const hasEnough = playerResources[res as ResourceType] >= amount;
                                    return (
                                        <div
                                            key={res}
                                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs ${hasEnough ? 'bg-slate-600 text-white' : 'bg-red-900/50 text-red-300'
                                                }`}
                                        >
                                            <span>{RESOURCE_ICONS[res as ResourceType]}</span>
                                            <span className="font-bold">{amount}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Açıklama */}
            <div className="mt-3 pt-2 border-t border-slate-700/30">
                <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-green-600"></span> Satın alabilirsin
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded bg-red-600"></span> Limit doldu
                    </span>
                </div>
            </div>
        </div>
    );
}
