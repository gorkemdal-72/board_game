import { useState, useEffect } from 'react';

interface ProfilePanelProps {
    socketUrl: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    onLogout: () => void;
}

interface GameHistoryEntry {
    id: string;
    roomName: string;
    date: number;
    players: { userId: string; username: string; color: string; vp: number; isWinner: boolean }[];
    winnerId: string;
    winnerName: string;
}

interface UserProfile {
    id: string;
    username: string;
    isAdmin: boolean;
    gamesPlayed: number;
    gamesWon: number;
}

export function ProfilePanel({ socketUrl, userId, username, isAdmin, onLogout }: ProfilePanelProps) {
    const [tab, setTab] = useState<'profile' | 'history' | 'admin'>('profile');
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [history, setHistory] = useState<GameHistoryEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [adminMsg, setAdminMsg] = useState('');

    useEffect(() => {
        // Profil bilgisi
        fetch(`${socketUrl}/api/profile/${userId}`)
            .then(r => r.json())
            .then(d => { if (d.success) setProfile(d.profile); });

        // Oyun geçmişi
        fetch(`${socketUrl}/api/history/${userId}`)
            .then(r => r.json())
            .then(d => { if (d.success) setHistory(d.history); });
    }, [socketUrl, userId]);

    const searchUsers = async () => {
        if (!searchQuery.trim()) return;
        const res = await fetch(`${socketUrl}/api/search-users?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.success) setSearchResults(data.users);
    };

    const toggleAdmin = async (targetId: string, makeAdmin: boolean) => {
        const token = localStorage.getItem('cumor_token');
        const res = await fetch(`${socketUrl}/api/set-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, targetUserId: targetId, makeAdmin })
        });
        const data = await res.json();
        setAdminMsg(data.message);
        // Listeyi güncelle
        searchUsers();
        setTimeout(() => setAdminMsg(''), 3000);
    };

    const winRate = profile && profile.gamesPlayed > 0
        ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100)
        : 0;

    return (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-4 w-full max-w-md">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="text-white font-bold flex items-center gap-1">
                            {username}
                            {isAdmin && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">ADMİN</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                            {profile ? `${profile.gamesPlayed} oyun • %${winRate} kazanma` : '...'}
                        </div>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="text-xs bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white px-3 py-1.5 rounded transition-colors"
                >
                    Çıkış
                </button>
            </div>

            {/* TABS */}
            <div className="flex border-b border-slate-700 mb-3 text-xs">
                <button
                    onClick={() => setTab('profile')}
                    className={`flex-1 py-2 font-bold ${tab === 'profile' ? 'text-blue-400 border-b border-blue-400' : 'text-slate-500'}`}
                >
                    📊 İstatistik
                </button>
                <button
                    onClick={() => setTab('history')}
                    className={`flex-1 py-2 font-bold ${tab === 'history' ? 'text-amber-400 border-b border-amber-400' : 'text-slate-500'}`}
                >
                    📜 Geçmiş
                </button>
                {isAdmin && (
                    <button
                        onClick={() => setTab('admin')}
                        className={`flex-1 py-2 font-bold ${tab === 'admin' ? 'text-red-400 border-b border-red-400' : 'text-slate-500'}`}
                    >
                        ⚙️ Admin
                    </button>
                )}
            </div>

            {/* İSTATİSTİK */}
            {tab === 'profile' && profile && (
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-black text-white">{profile.gamesPlayed}</div>
                        <div className="text-xs text-slate-400">Toplam Oyun</div>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-black text-green-400">{profile.gamesWon}</div>
                        <div className="text-xs text-slate-400">Kazanılan</div>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-black text-amber-400">%{winRate}</div>
                        <div className="text-xs text-slate-400">Kazanma Oranı</div>
                    </div>
                </div>
            )}

            {/* OYUN GEÇMİŞİ */}
            {tab === 'history' && (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {history.length === 0 ? (
                        <p className="text-center text-slate-500 text-sm py-4">Henüz oyun geçmişi yok</p>
                    ) : (
                        history.map(g => {
                            const myResult = g.players.find(p => p.userId === userId);
                            return (
                                <div key={g.id} className={`text-xs p-2 rounded border ${myResult?.isWinner ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-900/50 border-slate-700'}`}>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-white">{g.roomName}</span>
                                        <span className={`px-1.5 py-0.5 rounded font-bold ${myResult?.isWinner ? 'bg-green-500/20 text-green-400' : 'text-slate-400'}`}>
                                            {myResult?.isWinner ? '🏆 Kazandın' : `VP: ${myResult?.vp || 0}`}
                                        </span>
                                    </div>
                                    <div className="text-slate-500 mt-0.5">
                                        {new Date(g.date).toLocaleDateString('tr-TR')} • Kazanan: {g.winnerName}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ADMİN PANELİ — Kullanıcı Yönetimi */}
            {tab === 'admin' && isAdmin && (
                <div className="space-y-3">
                    {adminMsg && (
                        <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs p-2 rounded">
                            {adminMsg}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchUsers()}
                            placeholder="Kullanıcı adı ara..."
                            className="flex-1 p-2 bg-slate-900/50 text-white rounded text-xs border border-slate-600 outline-none"
                        />
                        <button onClick={searchUsers} className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded text-xs font-bold">
                            Ara
                        </button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                        {searchResults.map(u => (
                            <div key={u.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded text-xs">
                                <div>
                                    <span className="text-white font-bold">{u.username}</span>
                                    {u.isAdmin && <span className="ml-1 text-red-400">⭐</span>}
                                    <span className="text-slate-500 ml-2">{u.gamesPlayed} oyun</span>
                                </div>
                                <button
                                    onClick={() => toggleAdmin(u.id, !u.isAdmin)}
                                    className={`px-2 py-1 rounded font-bold ${u.isAdmin
                                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40'
                                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'
                                        }`}
                                >
                                    {u.isAdmin ? 'Admin Kaldır' : 'Admin Yap'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
