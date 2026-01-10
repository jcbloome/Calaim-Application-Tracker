'use client';

import { useEffect, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface DocumentUploadTrackerOptions {
  applicationId: string;
  uploadedFiles: any[];
  onNewUpload?: (newFiles: any[]) => void;
}

export function useDocumentUploadTracker({
  applicationId,
  uploadedFiles,
  onNewUpload
}: DocumentUploadTrackerOptions) {
  const firestore = useFirestore();
  const previousFilesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!uploadedFiles || !Array.isArray(uploadedFiles)) return;

    // Compare current files with previous files
    const previousFiles = previousFilesRef.current;
    const newFiles = uploadedFiles.filter(currentFile => {
      return !previousFiles.some(prevFile => 
        prevFile.name === currentFile.name && 
        prevFile.uploadedAt?.seconds === currentFile.uploadedAt?.seconds
      );
    });

    if (newFiles.length > 0 && previousFiles.length > 0) {
      console.log(`📄 New files detected: ${newFiles.length}`);
      
      // Flag new documents in Firestore
      if (firestore && applicationId) {
        updateDoc(doc(firestore, 'applications', applicationId), {
          hasNewDocuments: true,
          lastDocumentUpload: serverTimestamp(),
          newDocumentCount: newFiles.length
        }).catch(error => {
          console.error('Error flagging new documents:', error);
        });
      }

      // Call callback if provided
      if (onNewUpload) {
        onNewUpload(newFiles);
      }
    }

    // Update the reference
    previousFilesRef.current = [...uploadedFiles];
  }, [uploadedFiles, applicationId, firestore, onNewUpload]);

  const clearNewDocumentFlag = async () => {
    if (!firestore || !applicationId) return;

    try {
      await updateDoc(doc(firestore, 'applications', applicationId), {
        hasNewDocuments: false,
        newDocumentCount: 0
      });
    } catch (error) {
      console.error('Error clearing new document flag:', error);
    }
  };

  return {
    clearNewDocumentFlag
  };
}