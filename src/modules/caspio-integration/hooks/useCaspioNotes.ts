// Caspio Notes Hook
// Handles member notes fetching, creation, and management

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CaspioService } from '../services/CaspioService';
import type { CaspioNote, CaspioError } from '../types';

interface UseCaspioNotesReturn {
  notes: CaspioNote[];
  isLoading: boolean;
  error: CaspioError | null;
  fetchNotes: (memberId?: string) => Promise<void>;
  createNote: (noteData: Partial<CaspioNote>) => Promise<void>;
  searchNotes: (query: string) => Promise<CaspioNote[]>;
  getNotesByMember: (memberId: string) => CaspioNote[];
  clearError: () => void;
  refresh: () => Promise<void>;
}

export function useCaspioNotes(memberId?: string): UseCaspioNotesReturn {
  const [notes, setNotes] = useState<CaspioNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CaspioError | null>(null);

  const caspioService = CaspioService.getInstance();

  const fetchNotes = useCallback(async (targetMemberId?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const memberIdToUse = targetMemberId || memberId;
      
      if (memberIdToUse) {
        // Fetch notes for specific member
        const memberNotes = await caspioService.getMemberNotes(memberIdToUse);
        setNotes(memberNotes);
        console.log(`✅ Fetched ${memberNotes.length} notes for member ${memberIdToUse}`);
      } else {
        // Fetch all notes (if supported)
        console.warn('⚠️ Fetching all notes not implemented - provide memberId');
        setNotes([]);
      }
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      console.error('❌ Failed to fetch notes:', caspioError);
    } finally {
      setIsLoading(false);
    }
  }, [caspioService, memberId]);

  const createNote = useCallback(async (noteData: Partial<CaspioNote>) => {
    try {
      setError(null);
      
      const newNote = await caspioService.createMemberNote(noteData);
      
      // Add to local state
      setNotes(prevNotes => [newNote, ...prevNotes]);
      
      console.log('✅ Created new note');
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      console.error('❌ Failed to create note:', caspioError);
    }
  }, [caspioService]);

  const searchNotes = useCallback(async (query: string): Promise<CaspioNote[]> => {
    try {
      setError(null);
      
      const results = await caspioService.searchNotes(query);
      console.log(`✅ Found ${results.length} notes matching "${query}"`);
      
      return results;
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      console.error('❌ Note search failed:', caspioError);
      return [];
    }
  }, [caspioService]);

  const getNotesByMember = useCallback((targetMemberId: string): CaspioNote[] => {
    return notes.filter(note => note.memberId === targetMemberId);
  }, [notes]);

  const refresh = useCallback(async () => {
    await fetchNotes();
  }, [fetchNotes]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-fetch on mount if memberId is provided
  useEffect(() => {
    if (memberId) {
      fetchNotes();
    }
  }, [fetchNotes, memberId]);

  return {
    notes,
    isLoading,
    error,
    fetchNotes,
    createNote,
    searchNotes,
    getNotesByMember,
    clearError,
    refresh
  };
}