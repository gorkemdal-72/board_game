import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Service account key dosyasını oku
// Service account key okuma (Önce Env Var, sonra Dosya)
let serviceAccount: any;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('🔑 Firebase kimlik bilgileri ortam değişkeninden alındı.');
    } catch (error) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT ortam değişkeni hatalı JSON formatında!', error);
    }
} else {
    try {
        const serviceAccountPath = join(__dirname, '..', 'cumor-d4a59-firebase-adminsdk-fbsvc-6c6e85f5e1.json');
        serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
        console.log('wc Firebase kimlik bilgileri dosyadan alındı.');
    } catch (error) {
        console.warn('⚠️ Firebase servis hesabı dosyası bulunamadı ve ortam değişkeni ayarlanmamış.');
    }
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} else {
    console.error('❌ Firebase başlatılamadı: Kimlik bilgisi yok!');
}

export const db = admin.firestore();
console.log('🔥 Firebase Firestore bağlantısı başarılı!');
