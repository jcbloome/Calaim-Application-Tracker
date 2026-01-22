// Caspio Members Hook
// Handles member data fetching, caching, and management

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CaspioService } from '../services/CaspioService';
import type { CaspioMember, CaspioError } from '../types';

interface UseCaspioMembersReturn {
  members: CaspioMember[];
  isLoading: boolean;
  error: CaspioError | null;
  fetchMembers: () => Promise<void>;
  searchMembers: (query: string) => Promise<CaspioMember[]>;
  getMemberById: (id: string) => CaspioMember | null;
  updateMember: (id: string, data: Partial<CaspioMember>) => Promise<void>;
  clearError: () => void;
  refresh: () => Promise<void>;
}

export function useCaspioMembers(): UseCaspioMembersReturn {
  const [members, setMembers] = useState<CaspioMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CaspioError | null>(null);

  const caspioService = CaspioService.getInstance();

  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const fetchedMembers = await caspioService.getAllMembers();
      setMembers(fetchedMembers);
      
      console.log(`✅ Fetched ${fetchedMembers.length} members from Caspio`);
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      console.error('❌ Failed to fetch members:', caspioError);
    } finally {
      setIsLoading(false);
    }
  }, [caspioService]);

  const searchMembers = useCallback(async (query: string): Promise<CaspioMember[]> => {
    try {
      setError(null);
      
      const results = await caspioService.searchMembers(query);
      console.log(`✅ Found ${results.length} members matching "${query}"`);
      
      return results;
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      console.error('❌ Member search failed:', caspioError);
      return [];
    }
  }, [caspioService]);

  const getMemberById = useCallback((id: string): CaspioMember | null => {
    return members.find(member => member.id === id) || null;
  }, [members]);

  const updateMember = useCallback(async (id: string, data: Partial<CaspioMember>) => {
    try {
      setError(null);
      
      await caspioService.updateMemberRecord(id, data);
      
      // Update local state
      setMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === id ? { ...member, ...data } : member
        )
      );
      
      console.log(`✅ Updated member ${id}`);
    } catch (err) {
      const caspioError = err as CaspioError;
      setError(caspioError);
      console.error('❌ Failed to update member:', caspioError);
    }
  }, [caspioService]);

  const refresh = useCallback(async () => {
    await fetchMembers();
  }, [fetchMembers]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Disabled auto-fetch - only fetch when user manually triggers sync
  // useEffect(() => {
  //   fetchMembers();
  // }, [fetchMembers]);

  return {
    members,
    isLoading,
    error,
    fetchMembers,
    searchMembers,
    getMemberById,
    updateMember,
    clearError,
    refresh
  };
}