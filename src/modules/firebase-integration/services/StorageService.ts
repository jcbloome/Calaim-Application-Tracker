// Firebase Storage Service - Handles file uploads, downloads, and management

import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  getMetadata
} from 'firebase/storage';
import { storage } from '@/firebase';
import { FirebaseErrorHandler } from '../utils/errorHandler';
import { FIREBASE_CONFIG } from '../config/constants';
import type { StorageOptions, StorageFile, UploadProgress } from '../types';

export class StorageService {
  private storage = storage;

  /**
   * Upload a file to Firebase Storage
   */
  async uploadFile(
    path: string, 
    file: File, 
    options?: StorageOptions,
    onProgress?: (progress: number) => void
  ): Promise<{
    downloadURL: string;
    fullPath: string;
    size: number;
  }> {
    try {
      // Validate file
      this.validateFile(file, options);

      const storageRef = ref(this.storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            onProgress?.(progress);
          },
          (error) => {
            reject(FirebaseErrorHandler.handle(error, `File upload failed: ${path}`));
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({
                downloadURL,
                fullPath: uploadTask.snapshot.ref.fullPath,
                size: uploadTask.snapshot.totalBytes
              });
            } catch (error) {
              reject(FirebaseErrorHandler.handle(error, `Failed to get download URL: ${path}`));
            }
          }
        );
      });
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `File upload failed: ${path}`);
    }
  }

  /**
   * Delete a file from Firebase Storage
   */
  async deleteFile(path: string): Promise<void> {
    try {
      const storageRef = ref(this.storage, path);
      await deleteObject(storageRef);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `File deletion failed: ${path}`);
    }
  }

  /**
   * Get download URL for a file
   */
  async getDownloadURL(path: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      return await getDownloadURL(storageRef);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to get download URL: ${path}`);
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(path: string): Promise<StorageFile> {
    try {
      const storageRef = ref(this.storage, path);
      const metadata = await getMetadata(storageRef);
      const downloadURL = await getDownloadURL(storageRef);

      return {
        name: metadata.name,
        fullPath: metadata.fullPath,
        bucket: metadata.bucket,
        size: metadata.size,
        contentType: metadata.contentType,
        downloadURL,
        metadata: metadata.customMetadata,
        uploadedAt: new Date(metadata.timeCreated)
      };
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to get file metadata: ${path}`);
    }
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: File, options?: StorageOptions): void {
    const maxSize = options?.maxSize || FIREBASE_CONFIG.STORAGE.MAX_FILE_SIZE;
    const allowedTypes = options?.allowedTypes || FIREBASE_CONFIG.STORAGE.ALLOWED_TYPES;

    if (file.size > maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${maxSize} bytes`);
    }

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`);
    }
  }

  /**
   * Check if Storage service is available
   */
  isAvailable(): boolean {
    return this.storage !== null;
  }
}