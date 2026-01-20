// Firestore Service - Handles all Firestore operations
// Document and collection management with caching and real-time subscriptions

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/firebase';
import { FirebaseErrorHandler } from '../utils/errorHandler';
import type { 
  FirestoreDocument, 
  FirestoreCollection, 
  QueryOptions, 
  DocumentOptions,
  BatchOperation,
  BatchResult
} from '../types';

export class FirestoreService {
  private firestore = db;
  private subscriptions: Map<string, () => void> = new Map();

  /**
   * Get a single document
   */
  async getDocument<T>(
    collectionName: string, 
    documentId: string, 
    options?: DocumentOptions
  ): Promise<FirestoreDocument<T> | null> {
    try {
      const docRef = doc(this.firestore, collectionName, documentId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }

      return {
        id: docSnap.id,
        data: docSnap.data() as T,
        exists: true,
        createdAt: docSnap.data().createdAt,
        updatedAt: docSnap.data().updatedAt
      };
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Get document ${collectionName}/${documentId}`);
    }
  }

  /**
   * Create a new document
   */
  async createDocument<T>(
    collectionName: string, 
    data: T, 
    documentId?: string
  ): Promise<string> {
    try {
      const docRef = documentId 
        ? doc(this.firestore, collectionName, documentId)
        : doc(collection(this.firestore, collectionName));
      
      const docData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(docRef, docData);
      return docRef.id;
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Create document in ${collectionName}`);
    }
  }

  /**
   * Update an existing document
   */
  async updateDocument<T>(
    collectionName: string, 
    documentId: string, 
    data: Partial<T>
  ): Promise<void> {
    try {
      const docRef = doc(this.firestore, collectionName, documentId);
      const updateData = {
        ...data,
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, updateData);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Update document ${collectionName}/${documentId}`);
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(collectionName: string, documentId: string): Promise<void> {
    try {
      const docRef = doc(this.firestore, collectionName, documentId);
      await deleteDoc(docRef);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Delete document ${collectionName}/${documentId}`);
    }
  }

  /**
   * Get documents from a collection
   */
  async getCollection<T>(
    collectionName: string, 
    options?: QueryOptions
  ): Promise<FirestoreCollection<T>> {
    try {
      let q = collection(this.firestore, collectionName);
      let queryRef: any = q;

      // Apply query constraints
      if (options?.where) {
        for (const whereClause of options.where) {
          queryRef = query(queryRef, where(whereClause.field, whereClause.operator, whereClause.value));
        }
      }

      if (options?.orderBy) {
        for (const orderClause of options.orderBy) {
          queryRef = query(queryRef, orderBy(orderClause.field, orderClause.direction));
        }
      }

      if (options?.limit) {
        queryRef = query(queryRef, limit(options.limit));
      }

      const snapshot = await getDocs(queryRef);
      const docs: FirestoreDocument<T>[] = snapshot.docs.map(doc => ({
        id: doc.id,
        data: doc.data() as T,
        exists: true,
        createdAt: doc.data().createdAt,
        updatedAt: doc.data().updatedAt
      }));

      return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
        loading: false
      };
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Get collection ${collectionName}`);
    }
  }

  /**
   * Query documents with advanced filtering
   */
  async queryDocuments<T>(
    collectionName: string, 
    options: QueryOptions
  ): Promise<FirestoreDocument<T>[]> {
    const result = await this.getCollection<T>(collectionName, options);
    return result.docs;
  }

  /**
   * Subscribe to real-time collection updates
   */
  subscribeToCollection<T>(
    collectionName: string, 
    options: QueryOptions,
    callback: (docs: FirestoreDocument<T>[]) => void
  ): () => void {
    try {
      let q = collection(this.firestore, collectionName);
      let queryRef: any = q;

      // Apply query constraints
      if (options?.where) {
        for (const whereClause of options.where) {
          queryRef = query(queryRef, where(whereClause.field, whereClause.operator, whereClause.value));
        }
      }

      if (options?.orderBy) {
        for (const orderClause of options.orderBy) {
          queryRef = query(queryRef, orderBy(orderClause.field, orderClause.direction));
        }
      }

      if (options?.limit) {
        queryRef = query(queryRef, limit(options.limit));
      }

      const unsubscribe = onSnapshot(queryRef, (snapshot) => {
        const docs: FirestoreDocument<T>[] = snapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data() as T,
          exists: true,
          createdAt: doc.data().createdAt,
          updatedAt: doc.data().updatedAt
        }));

        callback(docs);
      });

      // Store subscription for cleanup
      const subscriptionId = `${collectionName}_${Date.now()}`;
      this.subscriptions.set(subscriptionId, unsubscribe);

      return () => {
        unsubscribe();
        this.subscriptions.delete(subscriptionId);
      };
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Subscribe to collection ${collectionName}`);
    }
  }

  /**
   * Subscribe to document changes
   */
  subscribeToDocument<T>(
    collectionName: string, 
    documentId: string,
    callback: (doc: FirestoreDocument<T> | null) => void,
    options?: DocumentOptions
  ): () => void {
    try {
      const docRef = doc(this.firestore, collectionName, documentId);

      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) {
          callback(null);
          return;
        }

        const document: FirestoreDocument<T> = {
          id: docSnap.id,
          data: docSnap.data() as T,
          exists: true,
          createdAt: docSnap.data().createdAt,
          updatedAt: docSnap.data().updatedAt
        };

        callback(document);
      });

      // Store subscription for cleanup
      const subscriptionId = `${collectionName}_${documentId}_${Date.now()}`;
      this.subscriptions.set(subscriptionId, unsubscribe);

      return () => {
        unsubscribe();
        this.subscriptions.delete(subscriptionId);
      };
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Subscribe to document ${collectionName}/${documentId}`);
    }
  }

  /**
   * Execute batch operations
   */
  async executeBatch(operations: BatchOperation[]): Promise<BatchResult> {
    const startTime = Date.now();
    const batch = writeBatch(this.firestore);
    const errors: any[] = [];

    try {
      for (const operation of operations) {
        const docRef = doc(this.firestore, operation.collection, operation.documentId);

        switch (operation.type) {
          case 'create':
          case 'update':
            if (operation.data) {
              const data = {
                ...operation.data,
                updatedAt: serverTimestamp()
              };
              if (operation.type === 'create') {
                data.createdAt = serverTimestamp();
              }
              batch.set(docRef, data, { merge: operation.type === 'update' });
            }
            break;
          case 'delete':
            batch.delete(docRef);
            break;
        }
      }

      await batch.commit();

      return {
        success: true,
        operations: operations.length,
        errors,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        operations: 0,
        errors: [FirebaseErrorHandler.handle(error, 'Batch operation failed')],
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Test Firestore connection
   */
  async testConnection(): Promise<void> {
    try {
      // Try to read from a test collection
      const testRef = collection(this.firestore, 'test');
      await getDocs(query(testRef, limit(1)));
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Firestore connection test failed');
    }
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup(): void {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }
}