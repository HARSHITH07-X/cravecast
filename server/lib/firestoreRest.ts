import { readFileSync } from 'fs';
import { resolve } from 'path';
import crypto from 'crypto';

// Read configuration safely
let config: any = {};
try {
  const configPath = resolve(process.cwd(), 'firebase-applet-config.json');
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  console.warn('Could not read firebase-applet-config.json in firestoreRest:', e);
}

export const PROJECT_ID = config.projectId || process.env.FIREBASE_PROJECT_ID || 'buoyant-ensign-klkcn';
export const DATABASE_ID = config.firestoreDatabaseId || '(default)';
export const API_KEY = config.apiKey || '';
export const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

// Helper: Convert JS object to Firestore REST fields
export function jsToFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const key in obj) {
    const val = obj[key];
    if (val === undefined) continue;
    fields[key] = jsValueToFirestore(val);
  }
  return fields;
}

function jsValueToFirestore(val: any): any {
  if (val === null) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return val.length > 0
      ? { arrayValue: { values: val.map(jsValueToFirestore) } }
      : { arrayValue: {} };
  }
  if (typeof val === 'object') {
    const fields = jsToFirestoreFields(val);
    return Object.keys(fields).length > 0 ? { mapValue: { fields } } : { mapValue: {} };
  }
  return { stringValue: String(val) };
}

// Helper: Convert Firestore REST fields to JS object
export function firestoreFieldsToJs(fields: Record<string, any> | undefined): Record<string, any> {
  if (!fields) return {};
  const result: Record<string, any> = {};
  for (const key in fields) {
    result[key] = firestoreValueToJs(fields[key]);
  }
  return result;
}

function firestoreValueToJs(val: any): any {
  if (!val) return null;
  if (val.nullValue !== undefined) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue !== undefined) {
    return (val.arrayValue.values || []).map(firestoreValueToJs);
  }
  if (val.mapValue !== undefined) {
    return firestoreFieldsToJs(val.mapValue.fields);
  }
  return null;
}

/**
 * Executes a structured query against Firestore using the authenticated user's ID token.
 */
export async function runQueryWithToken(
  collectionId: string,
  whereField: string,
  whereValue: string,
  idToken: string,
  limit: number = 100
): Promise<any[]> {
  const url = `${BASE_URL}:runQuery?key=${API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: whereField },
            op: 'EQUAL',
            value: { stringValue: String(whereValue) },
          },
        },
        limit,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore query failed (${response.status}): ${errText}`);
  }

  const results = await response.json();
  if (!Array.isArray(results)) return [];

  const items: any[] = [];
  for (const res of results) {
    if (res.document) {
      const docName = res.document.name || '';
      const docId = docName.split('/').pop() || '';
      const data = firestoreFieldsToJs(res.document.fields);
      items.push({ id: docId, ...data });
    }
  }
  return items;
}

/**
 * Creates or updates a document in Firestore using the user's ID token.
 */
export async function setDocumentWithToken(
  docPath: string, // e.g. "restaurants/rest123"
  data: Record<string, any>,
  idToken: string,
  options?: { merge?: boolean }
): Promise<any> {
  const cleanPath = docPath.replace(/^\/+|\/+$/g, '');
  let url = `${BASE_URL}/${cleanPath}?key=${API_KEY}`;
  if (options?.merge) {
    // If merge, append each field in updateMask
    const keys = Object.keys(data);
    if (keys.length > 0) {
      const maskParams = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      url += `&${maskParams}`;
    }
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: jsToFirestoreFields(data),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore write failed (${response.status}): ${errText}`);
  }

  const resDoc = await response.json();
  return { id: (resDoc.name || '').split('/').pop(), ...firestoreFieldsToJs(resDoc.fields) };
}

/**
 * Fetches a single document by path using the user's ID token.
 */
export async function getDocumentWithToken(
  docPath: string,
  idToken: string
): Promise<any | null> {
  const cleanPath = docPath.replace(/^\/+|\/+$/g, '');
  const url = `${BASE_URL}/${cleanPath}?key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore get failed (${response.status}): ${errText}`);
  }

  const resDoc = await response.json();
  return { id: (resDoc.name || '').split('/').pop(), ...firestoreFieldsToJs(resDoc.fields) };
}

/**
 * Deletes a single document by path using the user's ID token.
 */
export async function deleteDocumentWithToken(
  docPath: string,
  idToken: string
): Promise<void> {
  const cleanPath = docPath.replace(/^\/+|\/+$/g, '');
  const url = `${BASE_URL}/${cleanPath}?key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 404) return;
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore delete failed (${response.status}): ${errText}`);
  }
}

/**
 * Lists documents in a collection or subcollection using the user's ID token.
 */
export async function listDocumentsWithToken(
  collectionPath: string, // e.g. "restaurants/rest123/menu_items"
  idToken: string,
  pageSize: number = 500
): Promise<any[]> {
  const cleanPath = collectionPath.replace(/^\/+|\/+$/g, '');
  const url = `${BASE_URL}/${cleanPath}?pageSize=${pageSize}&key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore list failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.documents || !Array.isArray(data.documents)) return [];

  return data.documents.map((doc: any) => ({
    id: (doc.name || '').split('/').pop(),
    ...firestoreFieldsToJs(doc.fields),
  }));
}

/**
 * Commits a batch of writes atomically using Firestore REST commit.
 */
export async function commitBatchWithToken(
  writes: Array<{ type: 'set' | 'update' | 'delete'; path: string; data?: any; merge?: boolean }>,
  idToken: string
): Promise<void> {
  if (writes.length === 0) return;

  // Split into chunks of 400 to respect Firestore batch limits
  const chunkSize = 400;
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    const firestoreWrites = chunk.map((w) => {
      const cleanPath = w.path.replace(/^\/+|\/+$/g, '');
      const fullDocName = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${cleanPath}`;

      if (w.type === 'delete') {
        return { delete: fullDocName };
      }

      const updateObj: any = {
        name: fullDocName,
        fields: jsToFirestoreFields(w.data || {}),
      };

      if (w.merge && w.data) {
        updateObj.updateMask = { fieldPaths: Object.keys(w.data) };
      }

      return { update: updateObj };
    });

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:commit?key=${API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: firestoreWrites }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firestore batch commit failed (${response.status}): ${errText}`);
    }
  }
}

// =========================================================================
// Emulated Firestore Client Interface matching standard DocumentReference,
// CollectionReference, Query, Snapshot and WriteBatch.
// =========================================================================

export interface FirestoreClient {
  collection: (collectionPath: string) => CollectionReference;
  batch: () => WriteBatch;
}

export interface DocumentReference {
  id: string;
  path: string;
  get: () => Promise<DocumentSnapshot>;
  set: (data: any, options?: { merge?: boolean }) => Promise<void>;
  update: (data: any) => Promise<void>;
  delete: () => Promise<void>;
}

export interface DocumentSnapshot {
  id: string;
  exists: boolean;
  data: () => any;
  ref: DocumentReference;
}

export interface QuerySnapshot {
  empty: boolean;
  size: number;
  docs: DocumentSnapshot[];
}

export interface CollectionReference {
  path: string;
  doc: (docId?: string) => DocumentReference;
  where: (field: string, op: string, value: any) => QueryReference;
  orderBy: (field: string, direction?: 'asc' | 'desc') => QueryReference;
  limit: (n: number) => QueryReference;
  get: () => Promise<QuerySnapshot>;
}

export interface QueryReference {
  where: (field: string, op: string, value: any) => QueryReference;
  orderBy: (field: string, direction?: 'asc' | 'desc') => QueryReference;
  limit: (n: number) => QueryReference;
  get: () => Promise<QuerySnapshot>;
}

export interface WriteBatch {
  set: (docRef: DocumentReference, data: any, options?: { merge?: boolean }) => WriteBatch;
  update: (docRef: DocumentReference, data: any) => WriteBatch;
  delete: (docRef: DocumentReference) => WriteBatch;
  commit: () => Promise<void>;
}

function generateDocId(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function createFirestoreClient(idToken: string): FirestoreClient {
  function createDocRef(docPath: string): DocumentReference {
    const cleanPath = docPath.replace(/^\/+|\/+$/g, '');
    const id = cleanPath.split('/').pop() || '';

    return {
      id,
      path: cleanPath,
      get: async () => {
        const data = await getDocumentWithToken(cleanPath, idToken);
        return {
          id,
          exists: data !== null,
          data: () => data,
          ref: createDocRef(cleanPath),
        };
      },
      set: async (data: any, options?: { merge?: boolean }) => {
        await setDocumentWithToken(cleanPath, data, idToken, options);
      },
      update: async (data: any) => {
        await setDocumentWithToken(cleanPath, data, idToken, { merge: true });
      },
      delete: async () => {
        await deleteDocumentWithToken(cleanPath, idToken);
      },
    };
  }

  function createQuery(
    collectionPath: string,
    filters: Array<{ field: string; op: string; value: any }> = [],
    orderBys: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
    limitCount?: number
  ): QueryReference {
    const queryObj: QueryReference = {
      where: (field: string, op: string, value: any) => {
        return createQuery(
          collectionPath,
          [...filters, { field, op, value }],
          orderBys,
          limitCount
        );
      },
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => {
        return createQuery(
          collectionPath,
          filters,
          [...orderBys, { field, direction }],
          limitCount
        );
      },
      limit: (n: number) => {
        return createQuery(collectionPath, filters, orderBys, n);
      },
      get: async () => {
        const cleanPath = collectionPath.replace(/^\/+|\/+$/g, '');
        const segments = cleanPath.split('/');
        const isRootCollection = segments.length === 1;

        let docs: any[] = [];

        // For root collection queries with simple equality filter (e.g. restaurants where ownerUid == uid)
        if (isRootCollection && filters.length === 1 && filters[0].op === '==') {
          docs = await runQueryWithToken(
            segments[0],
            filters[0].field,
            filters[0].value,
            idToken,
            limitCount || 100
          );
        } else {
          // List documents in collection / subcollection
          docs = await listDocumentsWithToken(cleanPath, idToken, 1000);

          // Apply in-memory filters
          for (const f of filters) {
            docs = docs.filter((d) => {
              const val = d[f.field];
              if (f.op === '==') return val === f.value;
              if (f.op === '!=') return val !== f.value;
              if (f.op === '>=') return val >= f.value;
              if (f.op === '<=') return val <= f.value;
              if (f.op === '>') return val > f.value;
              if (f.op === '<') return val < f.value;
              if (f.op === 'array-contains') return Array.isArray(val) && val.includes(f.value);
              return true;
            });
          }

          // Apply orderBys
          for (const o of orderBys) {
            docs.sort((a, b) => {
              const valA = a[o.field];
              const valB = b[o.field];
              if (valA === valB) return 0;
              if (valA === undefined) return 1;
              if (valB === undefined) return -1;
              const cmp = valA > valB ? 1 : -1;
              return o.direction === 'desc' ? -cmp : cmp;
            });
          }

          // Apply limit
          if (typeof limitCount === 'number' && limitCount > 0) {
            docs = docs.slice(0, limitCount);
          }
        }

        const docSnapshots: DocumentSnapshot[] = docs.map((docData) => {
          const docId = docData.id;
          const fullPath = `${cleanPath}/${docId}`;
          return {
            id: docId,
            exists: true,
            data: () => docData,
            ref: createDocRef(fullPath),
          };
        });

        return {
          empty: docSnapshots.length === 0,
          size: docSnapshots.length,
          docs: docSnapshots,
        };
      },
    };

    return queryObj;
  }

  function createCollection(collectionPath: string): CollectionReference {
    const cleanPath = collectionPath.replace(/^\/+|\/+$/g, '');
    const query = createQuery(cleanPath);

    return {
      path: cleanPath,
      doc: (docId?: string) => {
        const finalId = docId || generateDocId();
        return createDocRef(`${cleanPath}/${finalId}`);
      },
      where: query.where,
      orderBy: query.orderBy,
      limit: query.limit,
      get: query.get,
    };
  }

  return {
    collection: createCollection,
    batch: () => {
      const queuedWrites: Array<{
        type: 'set' | 'update' | 'delete';
        path: string;
        data?: any;
        merge?: boolean;
      }> = [];

      const batchObj: WriteBatch = {
        set: (docRef: DocumentReference, data: any, options?: { merge?: boolean }) => {
          queuedWrites.push({
            type: 'set',
            path: docRef.path,
            data,
            merge: options?.merge,
          });
          return batchObj;
        },
        update: (docRef: DocumentReference, data: any) => {
          queuedWrites.push({
            type: 'update',
            path: docRef.path,
            data,
            merge: true,
          });
          return batchObj;
        },
        delete: (docRef: DocumentReference) => {
          queuedWrites.push({
            type: 'delete',
            path: docRef.path,
          });
          return batchObj;
        },
        commit: async () => {
          await commitBatchWithToken(queuedWrites, idToken);
        },
      };

      return batchObj;
    },
  };
}
