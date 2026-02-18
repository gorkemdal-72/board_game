import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Service account key dosyasını oku
const serviceAccountPath = join(__dirname, '..', 'cumor-d4a59-firebase-adminsdk-fbsvc-6c6e85f5e1.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

export const db = admin.firestore();
console.log('🔥 Firebase Firestore bağlantısı başarılı!');
