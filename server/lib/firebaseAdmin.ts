import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read configuration safely
let config: any = {};
try {
  const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e);
}

const app = getApps().length === 0
  ? initializeApp({
      projectId: config.projectId || process.env.FIREBASE_PROJECT_ID,
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = config.firestoreDatabaseId
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app);

export { app };
