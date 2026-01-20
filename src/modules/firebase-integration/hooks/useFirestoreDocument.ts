// Firestore Document Hook - Manages single document operations

'use client';

import { useState, useEffect, useCallback } from 'react';
import { FirebaseService } from '../services/FirebaseService';
import type { 
  FirestoreDocument, 
  DocumentOptions, 
  FirebaseError 
} from '../types';

interface UseFirestoreDocumentReturn<T> {
  // Data state
  document: FirestoreDocument<T> | null;
  
  // Loading states
  isLoading: boolean;
  isUpdating: boolean;
  
  // Error handling
  error: FirebaseError | null;
  
  // Actions
  refresh: () => Promise<void>;
  updateDocument: (data: Partial<T>) => Promise<void>;
  deleteDocument: () => Promise<void>;
  clearError: () => void;
  
  // Real-time subscription
  subscribe: () => () => void;
  unsubscribe: () => void;
  isSubscribed: boolean;
}

export function useFirestoreDocument<T = any>(
  collectionName: string,
  documentId: string,
  options?: DocumentOptions & {
    autoSubscribe?: boolean;
  }
): UseFirestoreDocumentReturn<T> {
  const [document, setDocument] = useState<FirestoreDocument<T> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<FirebaseError | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  const firebaseService = FirebaseService.getInstance();
  let unsubscribeRef: (() => void) | null = null;

  // Fetch document
  const fetchDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const doc = await firebaseService.getDocument<T>(collectionName, documentId, options);
      setDocument(doc);
      
      console.log(`✅ Fetched document ${collectionName}/${documentId}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to fetch ${collectionName}/${documentId}:`, firebaseError);
    } finally {
      setIsLoading(false);
    }
  }, [firebaseService, collectionName, documentId, options]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchDocument();
  }, [fetchDocument]);

  // Update document
  const updateDocument = useCallback(async (data: Partial<T>): Promise<void> => {
    try {
      setIsUpdating(true);
      setError(null);
      
      await firebaseService.updateDocument(collectionName, documentId, data);
      
      // Update local state optimistically
      if (document) {
        setDocument(prev => prev ? {
          ...prev,
          data: { ...prev.data, ...data }
        } : null);
      }
      
      console.log(`✅ Updated document ${collectionName}/${documentId}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to update document ${collectionName}/${documentId}:`, firebaseError);
      
      // Refresh to get correct state on error
      await refresh();
      throw firebaseError;
    } finally {
      setIsUpdating(false);
    }
  }, [firebaseService, collectionName, documentId, document, refresh]);

  // Delete document
  const deleteDocument = useCallback(async (): Promise<void> => {
    try {
      setIsUpdating(true);
      setError(null);
      
      await firebaseService.deleteDocument(collectionName, documentId);
      
      // Clear local state
      setDocument(null);
      
      console.log(`✅ Deleted document ${collectionName}/${documentId}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to delete document ${collectionName}/${documentId}:`, firebaseError);
      throw firebaseError;
    } finally {
      setIsUpdating(false);
    }
  }, [firebaseService, collectionName, documentId]);

  // Subscribe to real-time updates
  const subscribe = useCallback((): (() => void) => {
    if (unsubscribeRef) {
      unsubscribeRef();
    }

    const unsubscribe = firebaseService.subscribeToDocument<T>(
      collectionName,
      documentId,
      (updatedDoc) => {
        setDocument(updatedDoc);
        setIsLoading(false);
        setError(null);
      },
      options
    );

    unsubscribeRef = unsubscribe;
    setIsSubscribed(true);
    
    console.log(`🔄 Subscribed to real-time updates for ${collectionName}/${documentId}`);
    
    return unsubscribe;
  }, [firebaseService, collectionName, documentId, options]);

  // Unsubscribe from real-time updates
  const unsubscribe = useCallback(() => {
    if (unsubscribeRef) {
      unsubscribeRef();
      unsubscribeRef = null;
      setIsSubscribed(false);
      console.log(`🔄 Unsubscribed from ${collectionName}/${documentId}`);
    }
  }, [collectionName, documentId]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial fetch or subscribe
  useEffect(() => {
    if (options?.autoSubscribe) {
      subscribe();
    } else {
      fetchDocument();
    }

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef) {
        unsubscribeRef();
      }
    };
  }, [collectionName, documentId, options?.autoSubscribe, fetchDocument, subscribe]);

  return {
    // Data state
    document,
    
    // Loading states
    isLoading,
    isUpdating,
    
    // Error handling
    error,
    
    // Actions
    refresh,
    updateDocument,
    deleteDocument,
    clearError,
    
    // Real-time subscription
    subscribe,
    unsubscribe,
    isSubscribed
  };
}