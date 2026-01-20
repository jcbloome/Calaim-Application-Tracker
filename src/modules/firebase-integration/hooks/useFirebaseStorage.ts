// Firebase Storage Hook - Manages file uploads and downloads

'use client';

import { useState, useCallback } from 'react';
import { FirebaseService } from '../services/FirebaseService';
import type { 
  StorageOptions, 
  FirebaseError 
} from '../types';

interface UseFirebaseStorageReturn {
  // Loading states
  isUploading: boolean;
  isDeleting: boolean;
  uploadProgress: number;
  
  // Error handling
  error: FirebaseError | null;
  
  // Actions
  uploadFile: (path: string, file: File, options?: StorageOptions) => Promise<{
    downloadURL: string;
    fullPath: string;
    size: number;
  }>;
  deleteFile: (path: string) => Promise<void>;
  getDownloadURL: (path: string) => Promise<string>;
  clearError: () => void;
}

export function useFirebaseStorage(): UseFirebaseStorageReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<FirebaseError | null>(null);
  
  const firebaseService = FirebaseService.getInstance();

  // Upload file
  const uploadFile = useCallback(async (
    path: string, 
    file: File, 
    options?: StorageOptions
  ): Promise<{
    downloadURL: string;
    fullPath: string;
    size: number;
  }> => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);
      
      const result = await firebaseService.uploadFile(
        path, 
        file, 
        options,
        (progress) => setUploadProgress(progress)
      );
      
      console.log(`✅ File uploaded successfully: ${path}`);
      return result;
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ File upload failed: ${path}`, firebaseError);
      throw firebaseError;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [firebaseService]);

  // Delete file
  const deleteFile = useCallback(async (path: string): Promise<void> => {
    try {
      setIsDeleting(true);
      setError(null);
      
      await firebaseService.deleteFile(path);
      
      console.log(`✅ File deleted successfully: ${path}`);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ File deletion failed: ${path}`, firebaseError);
      throw firebaseError;
    } finally {
      setIsDeleting(false);
    }
  }, [firebaseService]);

  // Get download URL
  const getDownloadURL = useCallback(async (path: string): Promise<string> => {
    try {
      setError(null);
      
      const url = await firebaseService.getDownloadURL(path);
      
      console.log(`✅ Download URL retrieved: ${path}`);
      return url;
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error(`❌ Failed to get download URL: ${path}`, firebaseError);
      throw firebaseError;
    }
  }, [firebaseService]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Loading states
    isUploading,
    isDeleting,
    uploadProgress,
    
    // Error handling
    error,
    
    // Actions
    uploadFile,
    deleteFile,
    getDownloadURL,
    clearError
  };
}