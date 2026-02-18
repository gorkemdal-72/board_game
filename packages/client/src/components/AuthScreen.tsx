import { useState } from 'react';

interface AuthScreenProps {
    socketUrl: string;
    onAuth: (data: { token: string; userId: string; username: string; isAdmin: boolean }) => void;
}

export function AuthScreen({ socketUrl, onAuth }: AuthScreenProps) {
    const [tab, setTab] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setError('');
        setLoading(true);
        try {
            const endpoint = tab === 'login' ? '/api/login' : '/api/register';
            const res = await fetch(`${socketUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);

            // Token'ı localStorage'a kaydet
            localStorage.setItem('cumor_token', data.token);
            localStorage.setItem('cumor_userId', data.userId);
            localStorage.setItem('cumor_username', username.trim());

            onAuth({
                token: data.token,
                userId: data.userId,
                username: username.trim(),
                isAdmin: data.isAdmin
            });
        } catch (e: any) {
            setError(e.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="w-[420px] bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
                {/* HEADER */}
                <div className="bg-gradient-to-r from-blue-600/30 to-purple-600/30 p-8 text-center border-b border-slate-700/50">
                    <h1 className="text-4xl font-black text-white tracking-widest mb-1">CUMOR</h1>
                    <p className="text-slate-400 text-sm">Strateji Masa Oyunu</p>
                </div>

                {/* TABS */}
                <div className="flex border-b border-slate-700/50">
                    <button
                        onClick={() => { setTab('login'); setError(''); }}
                        className={`flex-1 py-3 font-bold text-sm transition-all ${tab === 'login'
                                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        GİRİŞ YAP
                    </button>
                    <button
                        onClick={() => { setTab('register'); setError(''); }}
                        className={`flex-1 py-3 font-bold text-sm transition-all ${tab === 'register'
                                ? 'text-green-400 border-b-2 border-green-400 bg-green-500/5'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        KAYIT OL
                    </button>
                </div>

                {/* FORM */}
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Kullanıcı Adı</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            className="w-full p-3 bg-slate-900/50 text-white rounded-lg border border-slate-600/50 outline-none focus:border-blue-500 transition-colors placeholder-slate-600"
                            placeholder="Kullanıcı adını gir"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Şifre</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            className="w-full p-3 bg-slate-900/50 text-white rounded-lg border border-slate-600/50 outline-none focus:border-blue-500 transition-colors placeholder-slate-600"
                            placeholder={tab === 'register' ? 'En az 4 karakter' : 'Şifreni gir'}
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg animate-pulse">
                            ❌ {error}
                        </div>
                    )}

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !username.trim() || !password}
                        className={`w-full py-3 rounded-lg font-bold text-white transition-all ${tab === 'login'
                                ? 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50'
                                : 'bg-green-600 hover:bg-green-500 disabled:bg-green-800/50'
                            } disabled:cursor-not-allowed shadow-lg`}
                    >
                        {loading ? '⏳ Yükleniyor...' : tab === 'login' ? '🔑 Giriş Yap' : '📝 Kayıt Ol'}
                    </button>

                    <p className="text-center text-slate-500 text-xs mt-2">
                        {tab === 'login'
                            ? 'Hesabın yok mu? Kayıt Ol sekmesine tıkla.'
                            : 'Zaten hesabın var mı? Giriş Yap sekmesine tıkla.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
