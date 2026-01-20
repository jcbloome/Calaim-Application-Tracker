// Comprehensive Firestore Collection Hook
// Replaces scattered Firestore collection usage throughout the app

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FirebaseService } from '../services/FirebaseService';
import type { 
  FirestoreDocument, 
  FirestoreCollection, 
  QueryOptions, 
  FirebaseError 
} from '../types';

interface UseFirestoreCollectionReturn<T> {
  // Data state
  documents: FirestoreDocument<T>[];
  collection: FirestoreCollection<T>;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  
  // Error handling
  error: FirebaseError | null;
  
  // Actions
  refresh: () => Promise<void>;
  addDocument: (data: T, documentId?: string) => Promise<string>;
  updateDocument: (documentId: string, data: Partial<T>) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  clearError: () => void;
  
  // Real-time subscription
  subscribe: () => () => void;
  unsubscribe: () => void;
  isSubscribed: boolean;
}

export function useFirestoreCollection<T = any>(
  collectionName: string,
  options?: QueryOptions & {
    autoSubscribe?: boolean;
    autoRefresh?: boolean;
  }
): UseFirestoreCollectionReturn<T> {
  const [documents, setDocuments] = useState<FirestoreDocument<T>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<FirebaseError | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  const firebaseService = FirebaseService.getInstance();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  
  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Fetch documents
  const fetchDocuments = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      
      const result = await firebaseService.getCollection<T>(collectionName, optionsRef.current);
      setDocuments(result.docs);
      
      console.log(`✅ Fetched ${result.docs.length} documents from ${collectionName}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to fetch ${collectionName}:`, firebaseError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [firebaseService, collectionName]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchDocuments(true);
  }, [fetchDocuments]);

  // Add document
  const addDocument = useCallback(async (data: T, documentId?: string): Promise<string> => {
    try {
      setError(null);
      
      const newDocId = await firebaseService.createDocument(collectionName, data, documentId);
      
      // Refresh collection to include new document
      await refresh();
      
      console.log(`✅ Added document to ${collectionName}:`, newDocId);
      return newDocId;
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to add document to ${collectionName}:`, firebaseError);
      throw firebaseError;
    }
  }, [firebaseService, collectionName, refresh]);

  // Update document
  const updateDocument = useCallback(async (documentId: string, data: Partial<T>): Promise<void> => {
    try {
      setError(null);
      
      await firebaseService.updateDocument(collectionName, documentId, data);
      
      // Update local state optimistically
      setDocuments(prev => prev.map(doc => 
        doc.id === documentId 
          ? { ...doc, data: { ...doc.data, ...data } }
          : doc
      ));
      
      console.log(`✅ Updated document ${collectionName}/${documentId}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to update document ${collectionName}/${documentId}:`, firebaseError);
      
      // Refresh to get correct state on error
      await refresh();
      throw firebaseError;
    }
  }, [firebaseService, collectionName, refresh]);

  // Delete document
  const deleteDocument = useCallback(async (documentId: string): Promise<void> => {
    try {
      setError(null);
      
      await firebaseService.deleteDocument(collectionName, documentId);
      
      // Update local state optimistically
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      
      console.log(`✅ Deleted document ${collectionName}/${documentId}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to delete document ${collectionName}/${documentId}:`, firebaseError);
      
      // Refresh to get correct state on error
      await refresh();
      throw firebaseError;
    }
  }, [firebaseService, collectionName, refresh]);

  // Subscribe to real-time updates
  const subscribe = useCallback((): (() => void) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const unsubscribe = firebaseService.subscribeToCollection<T>(
      collectionName,
      optionsRef.current || {},
      (updatedDocs) => {
        setDocuments(updatedDocs);
        setIsLoading(false);
        setError(null);
      }
    );

    unsubscribeRef.current = unsubscribe;
    setIsSubscribed(true);
    
    console.log(`🔄 Subscribed to real-time updates for ${collectionName}`);
    
    return unsubscribe;
  }, [firebaseService, collectionName]);

  // Unsubscribe from real-time updates
  const unsubscribe = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      setIsSubscribed(false);
      console.log(`🔄 Unsubscribed from ${collectionName}`);
    }
  }, [collectionName]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial fetch or subscribe
  useEffect(() => {
    if (options?.autoSubscribe) {
      subscribe();
    } else {
      fetchDocuments();
    }

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [collectionName, options?.autoSubscribe, fetchDocuments, subscribe]);

  // Auto-refresh interval
  useEffect(() => {
    if (!options?.autoRefresh || options?.autoSubscribe) return;

    const interval = setInterval(() => {
      refresh();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [options?.autoRefresh, options?.autoSubscribe, refresh]);

  // Create collection object for compatibility
  const collection: FirestoreCollection<T> = {
    docs: documents,
    size: documents.length,
    empty: documents.length === 0,
    loading: isLoading,
    error: error || undefined
  };

  return {
    // Data state
    documents,
    collection,
    
    // Loading states
    isLoading,
    isRefreshing,
    
    // Error handling
    error,
    
    // Actions
    refresh,
    addDocument,
    updateDocument,
    deleteDocument,
    clearError,
    
    // Real-time subscription
    subscribe,
    unsubscribe,
    isSubscribed
  };
}