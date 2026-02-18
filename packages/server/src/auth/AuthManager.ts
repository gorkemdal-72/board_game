import { db } from '../firebase.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface UserProfile {
  id: string;
  username: string;
  isAdmin: boolean;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: number;
}

export class AuthManager {
  private usersCol = db.collection('users');
  private sessionsCol = db.collection('sessions');

  // KAYIT: Yeni hesap oluştur
  async register(username: string, password: string): Promise<{ token: string; userId: string; isAdmin: boolean }> {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 2) throw new Error('Kullanıcı adı en az 2 karakter olmalı!');
    if (!password || password.length < 4) throw new Error('Şifre en az 4 karakter olmalı!');

    // Kullanıcı adı kontrolü (benzersiz olmalı)
    const existing = await this.usersCol.where('username', '==', trimmed.toLowerCase()).get();
    if (!existing.empty) throw new Error('Bu kullanıcı adı zaten alınmış!');

    // İlk kullanıcı mı? Super Admin olur
    const allUsers = await this.usersCol.limit(1).get();
    const isFirstUser = allUsers.empty;

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await this.usersCol.doc(userId).set({
      username: trimmed.toLowerCase(),
      displayName: trimmed,
      passwordHash,
      isAdmin: isFirstUser, // İlk kayıt = admin
      gamesPlayed: 0,
      gamesWon: 0,
      createdAt: Date.now()
    });

    // Oturum oluştur
    const token = uuidv4();
    await this.sessionsCol.doc(token).set({
      userId,
      createdAt: Date.now()
    });

    console.log(`✅ Kayıt: ${trimmed} (admin: ${isFirstUser})`);
    return { token, userId, isAdmin: isFirstUser };
  }

  // GİRİŞ: Mevcut hesapla oturum aç
  async login(username: string, password: string): Promise<{ token: string; userId: string; isAdmin: boolean }> {
    const trimmed = username.trim().toLowerCase();
    const snapshot = await this.usersCol.where('username', '==', trimmed).get();
    if (snapshot.empty) throw new Error('Kullanıcı bulunamadı!');

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    const isValid = await bcrypt.compare(password, userData.passwordHash);
    if (!isValid) throw new Error('Yanlış şifre!');

    // Oturum oluştur
    const token = uuidv4();
    await this.sessionsCol.doc(token).set({
      userId: userDoc.id,
      createdAt: Date.now()
    });

    console.log(`✅ Giriş: ${trimmed}`);
    return { token, userId: userDoc.id, isAdmin: userData.isAdmin || false };
  }

  // TOKEN DOĞRULAMA: Token geçerli mi kontrol et
  async verifyToken(token: string): Promise<{ userId: string; isAdmin: boolean } | null> {
    if (!token) return null;
    const sessionDoc = await this.sessionsCol.doc(token).get();
    if (!sessionDoc.exists) return null;

    const sessionData = sessionDoc.data()!;
    const userDoc = await this.usersCol.doc(sessionData.userId).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data()!;
    return { userId: sessionData.userId, isAdmin: userData.isAdmin || false };
  }

  // PROFİL: Kullanıcı bilgilerini getir
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const userDoc = await this.usersCol.doc(userId).get();
    if (!userDoc.exists) return null;
    const d = userDoc.data()!;
    return {
      id: userId,
      username: d.displayName || d.username,
      isAdmin: d.isAdmin || false,
      gamesPlayed: d.gamesPlayed || 0,
      gamesWon: d.gamesWon || 0,
      createdAt: d.createdAt
    };
  }

  // ADMİN YAPMA/KALDIRMA: Sadece adminler çağırabilir
  async setAdmin(requesterId: string, targetUserId: string, makeAdmin: boolean): Promise<string> {
    const requester = await this.usersCol.doc(requesterId).get();
    if (!requester.exists || !requester.data()!.isAdmin) {
      throw new Error('Bu işlem için admin yetkisi gerekli!');
    }

    const target = await this.usersCol.doc(targetUserId).get();
    if (!target.exists) throw new Error('Hedef kullanıcı bulunamadı!');

    await this.usersCol.doc(targetUserId).update({ isAdmin: makeAdmin });
    const targetName = target.data()!.displayName || target.data()!.username;
    return makeAdmin
      ? `${targetName} artık Admin! ⭐`
      : `${targetName} admin olmaktan çıkarıldı.`;
  }

  // KULLANICI ARA: İsme göre arama (admin paneli için)
  async searchUsers(query: string): Promise<UserProfile[]> {
    // Firestore'da tam metin arama yok, prefix match yaparız
    const snapshot = await this.usersCol
      .where('username', '>=', query.toLowerCase())
      .where('username', '<=', query.toLowerCase() + '\uf8ff')
      .limit(10)
      .get();

    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        username: d.displayName || d.username,
        isAdmin: d.isAdmin || false,
        gamesPlayed: d.gamesPlayed || 0,
        gamesWon: d.gamesWon || 0,
        createdAt: d.createdAt
      };
    });
  }

  // İSTATİSTİK GÜNCELLE
  async updateStats(userId: string, won: boolean): Promise<void> {
    const userRef = this.usersCol.doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;
    const d = userDoc.data()!;
    await userRef.update({
      gamesPlayed: (d.gamesPlayed || 0) + 1,
      gamesWon: (d.gamesWon || 0) + (won ? 1 : 0)
    });
  }

  // ÇIKIŞ
  async logout(token: string): Promise<void> {
    await this.sessionsCol.doc(token).delete();
  }
}
