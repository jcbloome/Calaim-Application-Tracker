'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useAutoTrackPortalAccess } from '@/hooks/use-sw-login-tracking';
import { useAuth } from '@/firebase';
import { clearStoredSwLoginDay, getTodayLocalDayKey, msUntilNextLocalMidnight, readStoredSwLoginDay, writeStoredSwLoginDay } from '@/lib/sw-daily-session';
import { Checkbox } from '@/components/ui/checkbox';
import { SWTopNav } from '@/components/sw/SWTopNav';
import { 
  MapPin, 
  Star, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  User,
  Building,
  Phone,
  Flag,
  Send,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Trash2,
  Home,
  Shield,
  Users,
  LogOut,
  Download
} from 'lucide-react';

interface MemberVisitQuestionnaire {
  visitId: string;
  memberId: string;
  memberName: string;
  socialWorkerId: string;
  rcfeId: string;
  rcfeName: string;
  rcfeAddress: string;
  visitDate: string;
  memberRoomNumber: string;
  memberSignoff: {
    acknowledged: boolean;
    signatureName: string;
    signedAt: string;
  };
  
  meetingLocation: {
    location: string;
    otherLocation?: string;
    notes?: string;
  };
  
  memberWellbeing: {
    physicalHealth: number;
    mentalHealth: number;
    socialEngagement: number;
    overallMood: number;
    notes: string;
  };
  
  careSatisfaction: {
    staffAttentiveness: number;
    mealQuality: number;
    cleanlinessOfRoom: number;
    activitiesPrograms: number;
    overallSatisfaction: number;
    notes: string;
  };
  
  memberConcerns: {
    hasConcerns: boolean | null;
    nonResponsive?: boolean;
    nonResponsiveReason?: string;
    nonResponsiveDetails?: string;
    concernTypes: {
      medical: boolean;
      staff: boolean;
      safety: boolean;
      food: boolean;
      social: boolean;
      financial: boolean;
      other: boolean;
    };
    urgencyLevel: string;
    detailedConcerns: string;
    actionRequired: boolean;
  };
  
  rcfeAssessment: {
    facilityCondition: number;
    staffProfessionalism: number;
    safetyCompliance: number;
    careQuality: number;
    overallRating: number;
    notes: string;
    flagForReview: boolean;
  };
  
  visitSummary: {
    totalScore: number;
    flagged: boolean;
  };
}

interface Member {
  id: string;
  name: string;
  room?: string;
  rcfeId: string;
  rcfeName: string;
  rcfeAddress: string;
  lastVisitDate?: string;
}

interface RCFE {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  zip?: string | null;
  administrator?: string | null;
  administratorPhone?: string | null;
  memberCount: number;
  members: Member[];
}

type MonthVisitStatus = {
  visitId: string;
  memberId: string;
  memberName: string;
  rcfeId: string;
  rcfeName: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId?: string;
};

// Star Rating Component
const StarRating: React.FC<{
  value: number;
  onChange: (value: number) => void;
  label: string;
}> = ({ value, onChange, label }) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`p-1 transition-colors ${
              star <= value 
                ? 'text-yellow-400' 
                : 'text-gray-300 hover:text-yellow-200'
            }`}
          >
            <Star className="h-8 w-8 fill-current" />
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {value === 0 ? 'Not rated' : 
           value === 1 ? 'Poor' :
           value === 2 ? 'Fair' :
           value === 3 ? 'Good' :
           value === 4 ? 'Very Good' :
           'Excellent'}
        </span>
      </div>
    </div>
  );
};

export default function SWVisitVerification() {
  const { user, socialWorkerData, isSocialWorker } = useSocialWorker();
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Track visit verification access
  useAutoTrackPortalAccess('visit-verification');

  const deepLinkMemberAppliedRef = useRef(false);
  const deepLinkRcfeId = useMemo(() => String(searchParams?.get('rcfeId') || '').trim(), [searchParams]);
  const deepLinkMemberId = useMemo(() => String(searchParams?.get('memberId') || '').trim(), [searchParams]);
  
  const [currentStep, setCurrentStep] = useState<'select-rcfe' | 'select-member' | 'questionnaire' | 'sign-off' | 'visit-completed'>('select-rcfe');
  const [selectedRCFE, setSelectedRCFE] = useState<RCFE | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [questionStep, setQuestionStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize questionnaire data
  const [questionnaire, setQuestionnaire] = useState<MemberVisitQuestionnaire>({
    visitId: '',
    memberId: '',
    memberName: '',
    socialWorkerId: 'Billy Buckhalter', // Default for testing
    rcfeId: '',
    rcfeName: '',
    rcfeAddress: '',
    visitDate: new Date().toISOString().split('T')[0],
    memberRoomNumber: '',
    memberSignoff: {
      acknowledged: false,
      signatureName: '',
      signedAt: '',
    },

    meetingLocation: {
      location: '',
      otherLocation: '',
      notes: ''
    },

    memberWellbeing: {
      physicalHealth: 0,
      mentalHealth: 0,
      socialEngagement: 0,
      overallMood: 0,
      notes: ''
    },

    careSatisfaction: {
      staffAttentiveness: 0,
      mealQuality: 0,
      cleanlinessOfRoom: 0,
      activitiesPrograms: 0,
      overallSatisfaction: 0,
      notes: ''
    },

    memberConcerns: {
      hasConcerns: null,
      nonResponsive: false,
      nonResponsiveReason: '',
      nonResponsiveDetails: '',
      concernTypes: {
        medical: false,
        staff: false,
        safety: false,
        food: false,
        social: false,
        financial: false,
        other: false
      },
      urgencyLevel: 'low',
      detailedConcerns: '',
      actionRequired: false
    },

    rcfeAssessment: {
      facilityCondition: 0,
      staffProfessionalism: 0,
      safetyCompliance: 0,
      careQuality: 0,
      overallRating: 0,
      notes: '',
      flagForReview: false
    },

    visitSummary: {
      totalScore: 0,
      flagged: false
    }
  });
  
  // Track completed visits for sign-off
  const [completedVisits, setCompletedVisits] = useState<Array<{
    memberId: string;
    memberName: string;
    visitId: string;
    rcfeId: string;
    rcfeName: string;
    claimDay: string;
    completedAt: string;
    flagged: boolean;
  }>>([]);

  const VISIT_FEE_RATE = 45;
  const DAILY_GAS_AMOUNT = 20;

  // UI progress markers (for checkmarks)
  const [visitedByRcfeId, setVisitedByRcfeId] = useState<Record<string, string[]>>({});
  const [signedOffByRcfeId, setSignedOffByRcfeId] = useState<Record<string, {
    signedAt: string;
    staffName: string;
    memberIds: string[];
    claimDay: string;
    visitCount: number;
    visitFees: number;
    gasAmount: number;
    totalAmount: number;
  }>>({});

  const [isExportingMonth, setIsExportingMonth] = useState(false);
  const exportMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const completedVisitsForSelectedRcfe = useMemo(() => {
    if (!selectedRCFE?.id) return [];
    return completedVisits.filter((v) => v.rcfeId === selectedRCFE.id);
  }, [completedVisits, selectedRCFE?.id]);

  const [selectedSignoffVisitIds, setSelectedSignoffVisitIds] = useState<string[]>([]);

  useEffect(() => {
    if (currentStep !== 'sign-off') return;
    // Default to selecting all completed visits for this RCFE.
    setSelectedSignoffVisitIds((prev) => {
      const all = completedVisitsForSelectedRcfe.map((v) => String(v.visitId || '').trim()).filter(Boolean);
      if (all.length === 0) return [];
      // If the previous selection is for the same set, keep it.
      const prevSet = new Set(prev.map((x) => String(x).trim()).filter(Boolean));
      const allSet = new Set(all);
      const isSubset = prev.length > 0 && prev.every((id) => allSet.has(id));
      if (isSubset) return prev.filter((id) => allSet.has(id));
      return all;
    });
  }, [completedVisitsForSelectedRcfe, currentStep]);

  const selectedVisitsForSignoff = useMemo(() => {
    const set = new Set(selectedSignoffVisitIds.map((x) => String(x).trim()).filter(Boolean));
    return completedVisitsForSelectedRcfe.filter((v) => set.has(String(v.visitId || '').trim()));
  }, [completedVisitsForSelectedRcfe, selectedSignoffVisitIds]);

  const getMemberKey = useCallback((member: any) => {
    const id = String(member?.id || '').trim();
    if (id) return id;
    const name = String(member?.name || '').trim();
    const room = String(member?.room || '').trim();
    const composite = `${name}${room ? `|${room}` : ''}`.trim();
    return composite;
  }, []);

  const membersAtSelectedRcfe = useMemo(() => {
    const members = Array.isArray(selectedRCFE?.members) ? selectedRCFE.members : [];
    const seen = new Set<string>();
    const out: Member[] = [];
    for (const m of members) {
      const key = getMemberKey(m);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out;
  }, [getMemberKey, selectedRCFE?.members]);

  const nextMemberAtSelectedRcfe = useMemo(() => {
    if (!selectedRCFE?.id) return null;
    const visited = new Set<string>(Array.isArray(visitedByRcfeId[selectedRCFE.id]) ? visitedByRcfeId[selectedRCFE.id] : []);
    const signed = new Set<string>(
      Array.isArray(signedOffByRcfeId[selectedRCFE.id]?.memberIds) ? signedOffByRcfeId[selectedRCFE.id].memberIds : []
    );
    for (const m of membersAtSelectedRcfe) {
      const k = getMemberKey(m);
      if (!k) continue;
      if (signed.has(k)) continue;
      if (visited.has(k)) continue;
      return m as any;
    }
    return null;
  }, [getMemberKey, membersAtSelectedRcfe, selectedRCFE, signedOffByRcfeId, visitedByRcfeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const swKey = String((user as any)?.uid || '').trim();
    if (!swKey) return;
    const key = `sw-visit-progress:${swKey}:${exportMonth}`;
    // No persisted save-progress; questionnaire is short and intentionally ephemeral.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(user as any)?.uid, exportMonth]);

  // Sign-off data
  const [signOffData, setSignOffData] = useState({
    rcfeStaffName: '',
    rcfeStaffTitle: '',
    signature: '',
    signedAt: '',
    geolocation: null as any,
    locationVerified: false
  });
  
  // Fetch SW's assigned RCFEs and members
  const [rcfeList, setRcfeList] = useState<RCFE[]>([]);
  const [isLoadingRCFEs, setIsLoadingRCFEs] = useState(false);
  const [membersOnHold, setMembersOnHold] = useState(0);
  const [membersCacheStatus, setMembersCacheStatus] = useState<{
    lastRunAt?: string | null;
    lastSyncAt?: string | null;
    lastMode?: string | null;
  } | null>(null);
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [draftVisitsByMemberId, setDraftVisitsByMemberId] = useState<
    Record<string, { visitId: string; flagged: boolean }>
  >({});
  const [loadingDraftVisits, setLoadingDraftVisits] = useState(false);

  const claimDayKey = useMemo(() => {
    const d = String(questionnaire.visitDate || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return new Date().toISOString().slice(0, 10);
  }, [questionnaire.visitDate]);

  const getIdToken = useCallback(async () => {
    try {
      const current = (auth as any)?.currentUser;
      const tok = await current?.getIdToken?.();
      if (tok) return String(tok);
    } catch {
      // ignore
    }
    try {
      const tok = await (user as any)?.getIdToken?.();
      if (tok) return String(tok);
    } catch {
      // ignore
    }
    return '';
  }, [auth, user]);

  const refreshDraftVisits = useCallback(async () => {
    if (!user || !isSocialWorker || !selectedRCFE?.id) {
      setDraftVisitsByMemberId({});
      return;
    }
    setLoadingDraftVisits(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch(
        `/api/sw-visits/draft-candidates?rcfeId=${encodeURIComponent(String(selectedRCFE.id))}&claimDay=${encodeURIComponent(
          claimDayKey
        )}&rcfeName=${encodeURIComponent(String(selectedRCFE.name || ''))}`,
        { headers: { authorization: `Bearer ${idToken}` } }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setDraftVisitsByMemberId({});
        return;
      }
      const rows: any[] = Array.isArray(data?.visits) ? data.visits : [];
      const map: Record<string, { visitId: string; flagged: boolean }> = {};
      rows.forEach((r) => {
        const memberId = String(r?.memberId || '').trim();
        const visitId = String(r?.visitId || '').trim();
        if (!memberId || !visitId) return;
        map[memberId] = { visitId, flagged: Boolean(r?.flagged) };
      });
      setDraftVisitsByMemberId(map);
    } catch (e) {
      console.warn('⚠️ Could not load draft visits (best-effort):', e);
      setDraftVisitsByMemberId({});
    } finally {
      setLoadingDraftVisits(false);
    }
  }, [claimDayKey, isSocialWorker, selectedRCFE?.id, user]);

  const downloadMonthlyVisitsCsv = useCallback(async () => {
    if (!user) return;
    setIsExportingMonth(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/sw-visits/monthly-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ month: exportMonth }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Export failed (${res.status})`);
      }

      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
      const header = [
        'Date',
        'Member',
        'RCFE',
        'RCFE Address',
        'Visit ID',
        'Flagged',
        'Signed Off',
        'Daily Visit Count',
        'Daily Visit Fees',
        'Daily Gas',
        'Daily Total',
      ];
      const escape = (value: any) => {
        const raw = String(value ?? '');
        if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
          return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
      };
      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.date || '',
            r.memberName || '',
            r.rcfeName || '',
            r.rcfeAddress || '',
            r.visitId || '',
            r.flagged ? 'Yes' : 'No',
            r.signedOff ? 'Yes' : 'No',
            r.dailyVisitCount ?? '',
            r.dailyVisitFees ?? '',
            r.dailyGas ?? '',
            r.dailyTotal ?? '',
          ].map(escape).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sw-visits-${exportMonth}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({
        title: 'Export downloaded',
        description: `Saved sw-visits-${exportMonth}.csv`,
      });
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error?.message || 'Could not download export.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingMonth(false);
    }
  }, [exportMonth, getIdToken, toast, user]);

  // Update socialWorkerId when user data becomes available
  useEffect(() => {
    if (user && (user.displayName || user.email || user.uid)) {
      // Prefer email for assignment matching. Caspio sometimes stores SW names as "Last, First"
      // which won't necessarily match Firebase displayName (e.g. "Frodo Baggins").
      const socialWorkerId = user.email || user.displayName || user.uid || 'Billy Buckhalter';
      setQuestionnaire(prev => ({
        ...prev,
        socialWorkerId
      }));
    }
  }, [user]);

  const fetchAssignedRCFEs = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!isSocialWorker || isLoading) return;

      setIsLoadingRCFEs(true);
      try {
        // Prefer email for assignment matching (see note above).
        const socialWorkerId = user?.email || user?.displayName || user?.uid;
        console.log('🔍 Fetching assignments for SW:', socialWorkerId);

        const response = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(String(socialWorkerId || ''))}`);
        const data = await response.json();

        if (data.success) {
          setRcfeList(data.rcfeList || []);
          setMembersOnHold(data.membersOnHold || 0);
          setMembersCacheStatus(data.cacheStatus || null);

          console.log(`✅ Loaded ${data.totalRCFEs} RCFEs with ${data.totalMembers} assigned members`);
          if (data.membersOnHold > 0) {
            console.log(
              `🚫 ${data.membersOnHold} members excluded (hold=${data.membersSuspendedHold || 0}, authExpired=${data.membersSuspendedAuthExpired || 0})`
            );
          }
        } else {
          throw new Error(data.error || 'Failed to fetch assignments');
        }
      } catch (error) {
        console.error('Error fetching RCFE assignments:', error);
        if (!opts?.quiet) {
          toast({
            title: "Loading Error",
            description: "Failed to load your assigned RCFEs. Using demo data.",
            variant: "destructive"
          });
        }

        // Fallback to demo data
        setRcfeList([
          {
            id: 'demo-rcfe-1',
            name: 'Demo RCFE - Sunrise Manor',
            address: '123 Oak Street, Los Angeles, CA 90210',
            memberCount: 3,
            members: [
              { id: 'demo-1', name: 'John Smith', room: 'Room 101', rcfeId: 'demo-rcfe-1', rcfeName: 'Demo RCFE - Sunrise Manor', rcfeAddress: '123 Oak Street, Los Angeles, CA 90210' },
              { id: 'demo-2', name: 'Mary Johnson', room: 'Room 105', rcfeId: 'demo-rcfe-1', rcfeName: 'Demo RCFE - Sunrise Manor', rcfeAddress: '123 Oak Street, Los Angeles, CA 90210' },
              { id: 'demo-3', name: 'Robert Wilson', room: 'Room 203', rcfeId: 'demo-rcfe-1', rcfeName: 'Demo RCFE - Sunrise Manor', rcfeAddress: '123 Oak Street, Los Angeles, CA 90210' },
            ]
          }
        ]);
      } finally {
        setIsLoadingRCFEs(false);
      }
    },
    [isSocialWorker, isLoading, toast, user]
  );

  const handleSignOut = useCallback(async (target: unknown = '/sw-login') => {
    const nextTarget = typeof target === 'string' ? target : '/sw-login';
    try {
      if (auth) await auth.signOut();
    } catch {
      // ignore
    }
    try {
      await fetch('/api/auth/sw-session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    router.push(nextTarget);
  }, [auth, router]);

  // Daily SW login enforcement: force re-login on a new day (and at midnight).
  useEffect(() => {
    if (!isSocialWorker) return;
    const today = getTodayLocalDayKey();
    const stored = readStoredSwLoginDay();
    if (!stored) {
      writeStoredSwLoginDay(today);
    } else if (stored !== today) {
      clearStoredSwLoginDay();
      void handleSignOut('/sw-login?reason=daily');
      return;
    }

    const timeoutMs = msUntilNextLocalMidnight() + 1000;
    const t = window.setTimeout(() => {
      clearStoredSwLoginDay();
      void handleSignOut('/sw-login?reason=daily');
    }, timeoutMs);
    return () => window.clearTimeout(t);
  }, [handleSignOut, isSocialWorker]);

  // Calculate total score and flags
  const calculateScore = () => {
    // If the member is non-responsive, exclude member-based ratings from scoring/flagging.
    const nonResponsive = Boolean(questionnaire.memberConcerns?.nonResponsive);
    const wellbeingScore = nonResponsive
      ? 0
      : questionnaire.memberWellbeing.physicalHealth +
        questionnaire.memberWellbeing.mentalHealth +
        questionnaire.memberWellbeing.socialEngagement +
        questionnaire.memberWellbeing.overallMood;
    
    const satisfactionScore = nonResponsive
      ? 0
      : questionnaire.careSatisfaction.staffAttentiveness +
        questionnaire.careSatisfaction.mealQuality +
        questionnaire.careSatisfaction.cleanlinessOfRoom +
        questionnaire.careSatisfaction.activitiesPrograms +
        questionnaire.careSatisfaction.overallSatisfaction;
    
    const rcfeScore = questionnaire.rcfeAssessment.facilityCondition +
                     questionnaire.rcfeAssessment.staffProfessionalism +
                     questionnaire.rcfeAssessment.safetyCompliance +
                     questionnaire.rcfeAssessment.careQuality +
                     questionnaire.rcfeAssessment.overallRating;
    
    const rawTotal = wellbeingScore + satisfactionScore + rcfeScore;
    const rawMax = nonResponsive ? 25 : 75;
    // Normalize to 0–100 for easier interpretation.
    const totalScore = rawMax > 0 ? Math.max(0, Math.min(100, Math.round((rawTotal / rawMax) * 100))) : 0;
    const lowScoreThreshold = 40; // 40%
    
    // Auto-flag conditions
    const flagged = totalScore < lowScoreThreshold ||
                   questionnaire.memberConcerns.urgencyLevel === 'critical' ||
                   questionnaire.memberConcerns.concernTypes.safety ||
                   questionnaire.rcfeAssessment.overallRating <= 2 ||
                   (!nonResponsive &&
                     questionnaire.careSatisfaction.overallSatisfaction > 0 &&
                     questionnaire.careSatisfaction.overallSatisfaction <= 2);
    
    setQuestionnaire(prev => ({
      ...prev,
      visitSummary: {
        ...prev.visitSummary,
        totalScore,
        flagged
      }
    }));
  };

  useEffect(() => {
    calculateScore();
  }, [questionnaire.memberWellbeing, questionnaire.careSatisfaction, questionnaire.rcfeAssessment, questionnaire.memberConcerns]);

  const handleRCFESelect = (rcfe: RCFE) => {
    setSelectedRCFE(rcfe);
    setCurrentStep('select-member');
  };

  const openExistingVisitForEdit = useCallback(
    async (visitId: string) => {
      if (!user) return;
      const idToken = await getIdToken();
      if (!idToken) {
        toast({ title: 'Please sign in again', description: 'No active session found.', variant: 'destructive' });
        return;
      }
      const res = await fetch(`/api/sw-visits/visit?visitId=${encodeURIComponent(visitId)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load visit (${res.status})`);
      }
      const visit = data?.visit || {};
      const raw = (visit as any)?.raw || null;
      if (!raw) throw new Error('Visit does not have editable questionnaire data.');
      setEditingVisitId(visitId);
      setQuestionnaire((prev) => ({
        ...prev,
        ...(raw as any),
        visitId,
        visitDate: String((raw as any)?.visitDate || visit?.visitDate || prev.visitDate || '').slice(0, 10) || prev.visitDate,
        memberRoomNumber: String((raw as any)?.memberRoomNumber || visit?.memberRoomNumber || '').trim(),
      }));
      setQuestionStep(1);
      setCurrentStep('questionnaire');
    },
    [getIdToken, toast, user]
  );

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    const socialWorkerId = user?.email || user?.displayName || user?.uid || 'Billy Buckhalter';
    const memberKey = member.id || member.name;

    const memberId = memberKey || `member-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('🔍 Member selected:', { 
      originalId: member.id, 
      generatedId: memberId, 
      memberName: member.name 
    });
    
    const status = memberId ? monthStatuses[memberId] : undefined;
    const statusClaim = String(status?.claimStatus || '').trim().toLowerCase();
    const alreadySubmitted = Boolean(status?.claimSubmitted) || ['submitted', 'approved', 'paid', 'rejected'].includes(statusClaim);
    if (status?.visitId) {
      // If already submitted/paid, block edits; otherwise open in edit mode.
      if (alreadySubmitted || Boolean(status?.claimPaid) || statusClaim === 'paid') {
        toast({
          title: 'Already submitted for this month',
          description: 'A claim has already been submitted for this member this month. You cannot submit another claim for the same member in the same month.',
          variant: 'destructive',
        });
        return;
      }
      void openExistingVisitForEdit(status.visitId);
      return;
    }

    const draft = memberId ? draftVisitsByMemberId[memberId] : undefined;
    if (draft?.visitId) {
      void openExistingVisitForEdit(draft.visitId);
      return;
    }

    setEditingVisitId(null);
    setQuestionnaire((prev) => ({
      ...prev,
      visitId: `visit-${Date.now()}`,
      memberId,
      memberName: member.name,
      socialWorkerId,
      rcfeId: member.rcfeId,
      rcfeName: member.rcfeName,
      rcfeAddress: member.rcfeAddress,
      memberRoomNumber: '',
      memberSignoff: { acknowledged: false, signatureName: '', signedAt: '' },
    }));
    setQuestionStep(1);
    setCurrentStep('questionnaire');
  };

  // Deep-link support (used by the SW roster): auto-select RCFE and optionally a member.
  useEffect(() => {
    const wantsLink = Boolean(deepLinkRcfeId || deepLinkMemberId);
    if (!wantsLink) return;
    if (!Array.isArray(rcfeList) || rcfeList.length === 0) return;

    let targetRcfe: RCFE | null =
      deepLinkRcfeId ? (rcfeList.find((r) => String(r?.id || '').trim() === deepLinkRcfeId) as any) || null : null;

    if (!targetRcfe && deepLinkMemberId) {
      targetRcfe =
        (rcfeList.find((r: any) => Array.isArray(r?.members) && r.members.some((m: any) => String(m?.id || '').trim() === deepLinkMemberId)) as any) ||
        null;
    }

    if (targetRcfe && (!selectedRCFE || String(selectedRCFE.id || '').trim() !== String(targetRcfe.id || '').trim())) {
      handleRCFESelect(targetRcfe);
      return;
    }

    if (deepLinkMemberId && selectedRCFE && !deepLinkMemberAppliedRef.current) {
      const members = Array.isArray(selectedRCFE.members) ? selectedRCFE.members : [];
      const targetMember = members.find((m) => String((m as any)?.id || '').trim() === deepLinkMemberId) || null;
      if (targetMember) {
        deepLinkMemberAppliedRef.current = true;
        handleMemberSelect(targetMember as any);
      }
    }
  }, [deepLinkMemberId, deepLinkRcfeId, rcfeList, selectedRCFE]);

  const restartQuestionnaire = async () => {
    if (!selectedMember) return;

    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Restart this questionnaire? This will clear all answers for this member.')
      : false;
    if (!confirmed) return;

    const socialWorkerId = user?.email || user?.displayName || user?.uid || questionnaire.socialWorkerId || 'unknown';
    const memberKey = selectedMember.id || selectedMember.name || questionnaire.memberId;

    setEditingVisitId(null);
    setQuestionnaire({
      visitId: `visit-${Date.now()}`,
      memberId: memberKey || `member-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      memberName: selectedMember.name,
      socialWorkerId,
      rcfeId: selectedMember.rcfeId,
      rcfeName: selectedMember.rcfeName,
      rcfeAddress: selectedMember.rcfeAddress,
      visitDate: new Date().toISOString().split('T')[0],
      memberRoomNumber: '',
      memberSignoff: {
        acknowledged: false,
        signatureName: '',
        signedAt: '',
      },
      meetingLocation: {
        location: '',
        otherLocation: '',
        notes: '',
      },
      memberWellbeing: {
        physicalHealth: 0,
        mentalHealth: 0,
        socialEngagement: 0,
        overallMood: 0,
        notes: '',
      },
      careSatisfaction: {
        staffAttentiveness: 0,
        mealQuality: 0,
        cleanlinessOfRoom: 0,
        activitiesPrograms: 0,
        overallSatisfaction: 0,
        notes: '',
      },
      memberConcerns: {
        hasConcerns: null,
        nonResponsive: false,
        nonResponsiveReason: '',
        nonResponsiveDetails: '',
        concernTypes: {
          medical: false,
          staff: false,
          safety: false,
          food: false,
          social: false,
          financial: false,
          other: false,
        },
        urgencyLevel: 'low',
        detailedConcerns: '',
        actionRequired: false,
      },
      rcfeAssessment: {
        facilityCondition: 0,
        staffProfessionalism: 0,
        safetyCompliance: 0,
        careQuality: 0,
        overallRating: 0,
        notes: '',
        flagForReview: false,
      },
      visitSummary: {
        totalScore: 0,
        flagged: false,
      },
    });
    setQuestionStep(1);
    setCurrentStep('questionnaire');
    toast({
      title: 'Questionnaire restarted',
      description: 'All answers have been cleared. You are back on Question 1.',
    });
  };

  const currentMonthKey = useMemo(() => {
    const d = String(questionnaire.visitDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
    return new Date().toISOString().slice(0, 7);
  }, [questionnaire.visitDate]);

  const refreshMonthStatuses = useCallback(async () => {
    if (!user) return;
    setLoadingMonthStatuses(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/sw-visits/monthly-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ month: currentMonthKey, dedupeByMemberMonth: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load statuses (${res.status})`);
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
      const map: Record<string, MonthVisitStatus> = {};
      rows.forEach((r) => {
        const memberId = String(r?.memberId || '').trim();
        if (!memberId) return;
        map[memberId] = {
          visitId: String(r?.visitId || '').trim(),
          memberId,
          memberName: String(r?.memberName || '').trim(),
          rcfeId: '', // filled client-side from selection when needed
          rcfeName: String(r?.rcfeName || '').trim(),
          signedOff: Boolean(r?.signedOff),
          claimStatus: String(r?.claimStatus || 'draft').trim(),
          claimSubmitted: Boolean(r?.claimSubmitted),
          claimPaid: Boolean(r?.claimPaid),
          claimId: String(r?.claimId || '').trim() || undefined,
        };
      });
      setMonthStatuses(map);
    } catch (e: any) {
      console.warn('⚠️ Could not load month statuses:', e);
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [currentMonthKey, getIdToken, user]);

  useEffect(() => {
    if (!isSocialWorker) return;
    // Best-effort: load month statuses on mount/when month changes.
    void refreshMonthStatuses();
  }, [isSocialWorker, refreshMonthStatuses]);

  useEffect(() => {
    if (!isSocialWorker) return;
    if (!selectedRCFE?.id) return;
    void refreshDraftVisits();
  }, [isSocialWorker, refreshDraftVisits, selectedRCFE?.id]);

  // Auto-load assignments on mount (Refresh remains available).
  useEffect(() => {
    fetchAssignedRCFEs({ quiet: true });
  }, [fetchAssignedRCFEs]);

  const deleteCurrentDraft = useCallback(async () => {
    if (!user) return;
    const visitId = String(questionnaire.visitId || '').trim();
    if (!visitId) return;

    const ok =
      typeof window !== 'undefined'
        ? window.confirm(
            'Delete this draft questionnaire?\n\nThis will permanently remove the saved draft so you can start over.'
          )
        : false;
    if (!ok) return;

    setIsLoading(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not signed in');

      const res = await fetch('/api/sw-visits/draft-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ visitId }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to delete draft (${res.status})`);
      }

      // Clear editing state and start a fresh draft for this member.
      setEditingVisitId(null);
      if (selectedMember) {
        const socialWorkerId = user?.email || user?.displayName || user?.uid || questionnaire.socialWorkerId || 'unknown';
        const memberKey = selectedMember.id || selectedMember.name || questionnaire.memberId;
        setQuestionnaire({
          visitId: `visit-${Date.now()}`,
          memberId: memberKey || `member-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          memberName: selectedMember.name,
          socialWorkerId,
          rcfeId: selectedMember.rcfeId,
          rcfeName: selectedMember.rcfeName,
          rcfeAddress: selectedMember.rcfeAddress,
          visitDate: new Date().toISOString().split('T')[0],
          memberRoomNumber: '',
          memberSignoff: { acknowledged: false, signatureName: '', signedAt: '' },
          meetingLocation: { location: '', otherLocation: '', notes: '' },
          memberWellbeing: { physicalHealth: 0, mentalHealth: 0, socialEngagement: 0, overallMood: 0, notes: '' },
          careSatisfaction: {
            staffAttentiveness: 0,
            mealQuality: 0,
            cleanlinessOfRoom: 0,
            activitiesPrograms: 0,
            overallSatisfaction: 0,
            notes: '',
          },
          memberConcerns: {
            hasConcerns: null,
            nonResponsive: false,
            nonResponsiveReason: '',
            nonResponsiveDetails: '',
            concernTypes: {
              medical: false,
              staff: false,
              safety: false,
              food: false,
              social: false,
              financial: false,
              other: false,
            },
            urgencyLevel: 'low',
            detailedConcerns: '',
            actionRequired: false,
          },
          rcfeAssessment: {
            facilityCondition: 0,
            staffProfessionalism: 0,
            safetyCompliance: 0,
            careQuality: 0,
            overallRating: 0,
            notes: '',
            flagForReview: false,
          },
          visitSummary: { totalScore: 0, flagged: false },
        });
      }
      setQuestionStep(1);
      setCurrentStep('questionnaire');

      void refreshDraftVisits();

      toast({ title: 'Draft deleted', description: 'Draft questionnaire removed. You can start over now.' });
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e?.message || 'Could not delete this draft.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken, questionnaire.visitId, questionnaire.memberId, questionnaire.socialWorkerId, refreshDraftVisits, selectedMember, toast, user]);

  // Form validation functions
  const validateCurrentQuestion = () => {
    const nonResponsive = Boolean(questionnaire.memberConcerns?.nonResponsive);
    switch (questionStep) {
      case 1: // Meeting Location
        return questionnaire.meetingLocation.location.trim() !== '' && questionnaire.memberRoomNumber.trim() !== '';
      case 2: // Member Wellbeing
        if (nonResponsive) return true;
        return questionnaire.memberWellbeing.physicalHealth > 0 && 
               questionnaire.memberWellbeing.mentalHealth > 0 &&
               questionnaire.memberWellbeing.socialEngagement > 0 &&
               questionnaire.memberWellbeing.overallMood > 0;
      case 3: // Care Satisfaction
        if (nonResponsive) return true;
        return questionnaire.careSatisfaction.staffAttentiveness > 0 &&
               questionnaire.careSatisfaction.mealQuality > 0 &&
               questionnaire.careSatisfaction.cleanlinessOfRoom > 0 &&
               questionnaire.careSatisfaction.activitiesPrograms > 0 &&
               questionnaire.careSatisfaction.overallSatisfaction > 0;
      case 4: // Member Concerns
        if (questionnaire.memberConcerns.hasConcerns === true) {
          return String(questionnaire.memberConcerns.detailedConcerns || '').trim().length > 0;
        }
        return nonResponsive ? true : questionnaire.memberConcerns.hasConcerns !== null;
      case 5: // RCFE Assessment
        return questionnaire.rcfeAssessment.facilityCondition > 0 &&
               questionnaire.rcfeAssessment.staffProfessionalism > 0 &&
               questionnaire.rcfeAssessment.safetyCompliance > 0 &&
               questionnaire.rcfeAssessment.careQuality > 0 &&
               questionnaire.rcfeAssessment.overallRating > 0;
      case 6: // SW Notes  
        return true; // Visit summary doesn't require additional input
      default:
        return true;
    }
  };

  const getValidationMessage = () => {
    const nonResponsive = Boolean(questionnaire.memberConcerns?.nonResponsive);
    switch (questionStep) {
      case 1:
        return "Please enter the member's room number and select where you met the member";
      case 2:
        return nonResponsive ? "Member is marked non-responsive (ratings optional)" : "Please rate all aspects of member wellbeing";
      case 3:
        return nonResponsive ? "Member is marked non-responsive (ratings optional)" : "Please rate all aspects of care satisfaction";
      case 4:
        if (questionnaire.memberConcerns.hasConcerns === true) return "Please describe the member's concerns";
        return nonResponsive ? "Member is marked non-responsive (concerns optional)" : "Please indicate if the member has concerns";
      case 5:
        return "Please rate all aspects of the RCFE";
      case 6:
        return "Please provide your observations";
      default:
        return "Please complete all required fields";
    }
  };

  const nextQuestion = () => {
    if (!validateCurrentQuestion()) {
      toast({
        title: "Required Fields Missing",
        description: getValidationMessage(),
        variant: "destructive"
      });
      return;
    }
    
    if (questionStep < 6) {
      setQuestionStep(questionStep + 1);
    }
  };

  const prevQuestion = () => {
    if (questionStep > 1) {
      setQuestionStep(questionStep - 1);
    }
  };

  const validateCompleteForm = () => {
    // Check all required fields are completed
    const errors = [];
    const nonResponsive = Boolean(questionnaire.memberConcerns?.nonResponsive);
    
    if (!questionnaire.memberRoomNumber.trim()) {
      errors.push("Member room number is required");
    }

    if (!questionnaire.meetingLocation.location.trim()) {
      errors.push("Meeting location is required");
    }
    
    if (!nonResponsive && questionnaire.memberWellbeing.physicalHealth === 0) {
      errors.push("Physical health rating is required");
    }
    
    if (!nonResponsive && questionnaire.memberWellbeing.mentalHealth === 0) {
      errors.push("Mental health rating is required");
    }
    
    if (!nonResponsive && questionnaire.memberWellbeing.socialEngagement === 0) {
      errors.push("Social engagement rating is required");
    }
    
    if (!nonResponsive && questionnaire.memberWellbeing.overallMood === 0) {
      errors.push("Overall mood rating is required");
    }
    
    if (!nonResponsive && questionnaire.careSatisfaction.staffAttentiveness === 0) {
      errors.push("Staff attentiveness rating is required");
    }
    
    if (!nonResponsive && questionnaire.careSatisfaction.mealQuality === 0) {
      errors.push("Meal quality rating is required");
    }
    
    if (!nonResponsive && questionnaire.careSatisfaction.cleanlinessOfRoom === 0) {
      errors.push("Cleanliness of room rating is required");
    }
    
    if (!nonResponsive && questionnaire.careSatisfaction.activitiesPrograms === 0) {
      errors.push("Activities & programs rating is required");
    }
    
    if (!nonResponsive && questionnaire.careSatisfaction.overallSatisfaction === 0) {
      errors.push("Overall satisfaction rating is required");
    }
    
    if (!nonResponsive && questionnaire.memberConcerns.hasConcerns === null) {
      errors.push("Member concerns indication is required");
    }

    if (questionnaire.memberConcerns.hasConcerns === true && !String(questionnaire.memberConcerns.detailedConcerns || '').trim()) {
      errors.push("Please provide a detailed description of member concerns");
    }
    
    if (questionnaire.rcfeAssessment.facilityCondition === 0) {
      errors.push("Facility condition rating is required");
    }
    
    if (questionnaire.rcfeAssessment.staffProfessionalism === 0) {
      errors.push("Staff professionalism rating is required");
    }
    
    if (questionnaire.rcfeAssessment.safetyCompliance === 0) {
      errors.push("Safety compliance rating is required");
    }
    
    if (questionnaire.rcfeAssessment.careQuality === 0) {
      errors.push("Care quality rating is required");
    }
    
    if (questionnaire.rcfeAssessment.overallRating === 0) {
      errors.push("Overall rating is required");
    }

    if (questionnaire.memberSignoff?.acknowledged && !String(questionnaire.memberSignoff?.signatureName || '').trim()) {
      errors.push("Member signature name is required (or uncheck member sign-off)");
    }
    
    // Note: Social worker observations are captured in rcfeAssessment.notes
    // No additional observations required for visit summary
    
    return errors;
  };

  const cacheFreshness = useMemo(() => {
    const raw = String(membersCacheStatus?.lastRunAt || membersCacheStatus?.lastSyncAt || '').trim();
    const d = raw ? new Date(raw) : null;
    const valid = d && !Number.isNaN(d.getTime()) ? d : null;
    const ageMs = valid ? Date.now() - valid.getTime() : Number.POSITIVE_INFINITY;
    const isStale = ageMs > 15 * 60 * 1000;
    const ageMinutes = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 60000)) : null;
    return {
      lastUpdate: valid,
      ageMinutes,
      isStale,
    };
  }, [membersCacheStatus]);

  const visitMonthLabel = useMemo(() => {
    const raw = String(questionnaire.visitDate || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }, [questionnaire.visitDate]);

  const submitQuestionnaire = async () => {
    // Validate all required fields before submission
    const validationErrors = validateCompleteForm();
    if (validationErrors.length > 0) {
      toast({
        title: "Required Fields Missing",
        description: `Please complete: ${validationErrors.slice(0, 3).join(', ')}${validationErrors.length > 3 ? ` and ${validationErrors.length - 3} more` : ''}`,
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    try {
      // Get current location for verification
      let geolocation = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000
            });
          });
          
          geolocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          
          console.log('📍 Location captured:', geolocation);
        } catch (geoError) {
          console.warn('⚠️ Could not get location:', geoError);
        }
      }

      // Save draft to API (no claim yet)
      const submitData = {
        ...questionnaire,
        socialWorkerUid: user?.uid || null,
        socialWorkerEmail: (user?.email || '').toLowerCase() || null,
        socialWorkerName: user?.displayName || user?.email || questionnaire.socialWorkerId || null,
        geolocation
      };

      console.log('🔍 Submitting visit data:', {
        visitId: submitData.visitId,
        memberId: submitData.memberId,
        memberName: submitData.memberName,
        socialWorkerId: submitData.socialWorkerId,
        hasGeolocation: !!geolocation
      });

      // Validate required fields before submission
      if (!submitData.visitId || !submitData.memberId || !submitData.socialWorkerId) {
        throw new Error(`Missing required fields: ${!submitData.visitId ? 'visitId ' : ''}${!submitData.memberId ? 'memberId ' : ''}${!submitData.socialWorkerId ? 'socialWorkerId' : ''}`);
      }

      const isEditing = Boolean(editingVisitId) && String(editingVisitId) === String(submitData.visitId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not signed in');

      const response = await fetch('/api/sw-visits/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(submitData)
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Submission failed');
      }

      const savedVisitId = String(result?.visitId || submitData.visitId || '').trim();
      const didReuseExistingDraft = Boolean(savedVisitId) && savedVisitId !== String(submitData.visitId || '').trim();
      if (savedVisitId && savedVisitId !== questionnaire.visitId) {
        setQuestionnaire((prev) => ({ ...prev, visitId: savedVisitId }));
      }

      // Best-effort: refresh draft list.
      void refreshDraftVisits();

      const treatAsEditing = isEditing || didReuseExistingDraft;

      if (!treatAsEditing) {
        // Add to completed visits first
        setCompletedVisits(prev => [...prev, {
          memberId: questionnaire.memberId,
          memberName: questionnaire.memberName,
          visitId: savedVisitId || questionnaire.visitId,
          rcfeId: questionnaire.rcfeId,
          rcfeName: questionnaire.rcfeName,
          claimDay: String(questionnaire.visitDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          completedAt: new Date().toISOString(),
          flagged: questionnaire.visitSummary.flagged
        }]);

        // Track visited member for checkmarks (today-only UX)
        setVisitedByRcfeId((prev) => {
          const rcfeId = String(questionnaire.rcfeId || '').trim();
          const memberId = String(questionnaire.memberId || '').trim();
          if (!rcfeId || !memberId) return prev;
          const existing = Array.isArray(prev[rcfeId]) ? prev[rcfeId] : [];
          if (existing.includes(memberId)) return prev;
          return { ...prev, [rcfeId]: [...existing, memberId] };
        });
      }
      
      // Show comprehensive success message
      toast({
        title: treatAsEditing ? "✅ Draft Updated" : "✅ Draft Saved",
        description: treatAsEditing
          ? `${questionnaire.memberName}'s questionnaire draft has been updated.`
          : `${questionnaire.memberName}'s questionnaire draft has been saved. When you’re done at this RCFE, go to Sign Off & Submit to submit questionnaires and the claim.`,
        variant: "default",
        duration: 5000 // Show longer for important message
      });

      if (result.nextActions && result.nextActions.length > 0) {
        console.log('📋 Next actions:', result.nextActions);
      }
      
      // Go to visit completed step with navigation options (or back to member list when editing).
      if (treatAsEditing) {
        setEditingVisitId(null);
        setCurrentStep('select-member');
      } else {
        setCurrentStep('visit-completed');
      }
      
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        title: "Submission Error",
        description: error.message || "Failed to submit visit. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSocialWorker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="bg-white rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center shadow-lg">
              <Shield className="h-12 w-12 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Social Worker Access Required</h1>
              <p className="text-gray-600 mb-6">
                This is the member visit verification system. Please sign in with your social worker credentials.
              </p>
              <div className="space-y-3">
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
                  <Link href="/sw-login">
                    <Users className="h-4 w-4 mr-2" />
                    Social Worker Login
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const swName = String(
    (socialWorkerData as any)?.displayName ||
      (user as any)?.displayName ||
      (user as any)?.email ||
      'Social Worker'
  ).trim() || 'Social Worker';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
            <Link href="/sw-portal" className="shrink-0">
              <Image
                src="/calaimlogopdf.png"
                alt="Connect CalAIM Logo"
                width={240}
                height={67}
                className="w-36 sm:w-44 h-auto object-contain"
                priority
              />
            </Link>

            <SWTopNav className="shrink-0" />

            <div className="ml-auto shrink-0 flex items-center gap-3">
              <div className="text-sm font-semibold text-foreground max-w-[160px] sm:max-w-[240px] truncate">
                {swName}
              </div>
              <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Step 1: Select RCFE */}
        {currentStep === 'select-rcfe' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Select RCFE to Visit
              </CardTitle>
              <div className={`mt-2 rounded-lg border p-3 ${cacheFreshness.isStale ? 'border-amber-200 bg-amber-50' : 'bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-medium text-slate-700">Assignments cache</div>
                    <div className="text-xs text-muted-foreground">
                      Last update:{' '}
                      {cacheFreshness.lastUpdate ? cacheFreshness.lastUpdate.toLocaleString() : 'Unknown'}
                      {cacheFreshness.ageMinutes != null ? ` • ~${cacheFreshness.ageMinutes} min ago` : ''}
                      {cacheFreshness.isStale ? ' • stale' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => fetchAssignedRCFEs()} disabled={isLoadingRCFEs}>
                      {isLoadingRCFEs ? 'Refreshing…' : 'Refresh'}
                    </Button>
                  </div>
                </div>
                {cacheFreshness.isStale ? (
                  <div className="mt-2 text-xs text-amber-700">
                    If assignments look outdated, click Refresh.
                  </div>
                ) : null}
              </div>
              {membersOnHold > 0 && (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {membersOnHold} of your authorized member{membersOnHold !== 1 ? 's are' : ' is'} currently suspended for SW visits (hold or authorization ended) (not shown here)
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingRCFEs ? (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading your assigned RCFEs...</p>
                </div>
              ) : rcfeList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building className="h-8 w-8 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No RCFEs Assigned</p>
                  <p className="text-sm">Contact your supervisor to get RCFE assignments.</p>
                </div>
              ) : (
                rcfeList.map((rcfe) => (
                  <div
                  key={rcfe.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleRCFESelect(rcfe)}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{rcfe.name}</h3>
                      <p className="text-sm text-muted-foreground flex items-start gap-1 mt-1 min-w-0">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="min-w-0 break-words">
                          {String(
                            [
                              String(rcfe.address || '').trim(),
                              [String(rcfe.city || '').trim(), String(rcfe.zip || '').trim()].filter(Boolean).join(' '),
                            ]
                              .map((s) => String(s || '').trim())
                              .filter(Boolean)
                              .join(', ')
                          )}
                        </span>
                      </p>
                      {(rcfe.administrator || rcfe.administratorPhone) ? (
                        <p className="text-sm text-muted-foreground flex items-start gap-2 mt-1 min-w-0">
                          <Phone className="h-4 w-4 shrink-0 mt-0.5" />
                          <span className="min-w-0 break-words">
                            {rcfe.administrator ? <span>Admin: {rcfe.administrator}</span> : null}
                            {rcfe.administratorPhone ? (
                              <>
                                {rcfe.administrator ? <span className="text-muted-foreground"> • </span> : null}
                                <a className="hover:underline" href={`tel:${String(rcfe.administratorPhone).replace(/[^\d+]/g, '')}`}>
                                  {rcfe.administratorPhone}
                                </a>
                              </>
                            ) : null}
                          </span>
                        </p>
                      ) : null}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">
                          {rcfe.memberCount} members
                        </Badge>
                        {signedOffByRcfeId[rcfe.id] ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Signed off
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400 shrink-0" />
                  </div>
                </div>
              )))}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select Member */}
        {currentStep === 'select-member' && selectedRCFE && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (completedVisitsForSelectedRcfe.length > 0) {
                      const ok =
                        typeof window !== 'undefined'
                          ? window.confirm(
                              `You have ${completedVisitsForSelectedRcfe.length} completed visit(s) at this RCFE that still need sign-off.\n\nDo you want to leave anyway?`
                            )
                          : true;
                      if (!ok) return;
                    }
                    setCurrentStep('select-rcfe');
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                {completedVisitsForSelectedRcfe.length > 0 && (
                  <Button
                    onClick={() =>
                      router.push(
                        `/sw-portal/sign-off?rcfeId=${encodeURIComponent(String(selectedRCFE?.id || ''))}&claimDay=${encodeURIComponent(
                          claimDayKey
                        )}`
                      )
                    }
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Sign Off & Submit ({completedVisitsForSelectedRcfe.length})
                  </Button>
                )}
              </div>
              <CardTitle className="flex items-center gap-2">
                Select Member to Visit
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedRCFE.name} - {String(
                  [String(selectedRCFE.address || '').trim(), [String(selectedRCFE.city || '').trim(), String(selectedRCFE.zip || '').trim()].filter(Boolean).join(' ')]
                    .map((s) => String(s || '').trim())
                    .filter(Boolean)
                    .join(', ')
                )}
                {completedVisitsForSelectedRcfe.length > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    • {completedVisitsForSelectedRcfe.length} visit{completedVisitsForSelectedRcfe.length !== 1 ? 's' : ''} completed
                  </span>
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {completedVisitsForSelectedRcfe.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-amber-900">Drafts saved at this RCFE</div>
                      <div className="mt-0.5 text-xs text-amber-800/80">
                        Ready for RCFE staff attestation and final submission when you’re done at this home
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() =>
                        router.push(
                          `/sw-portal/sign-off?rcfeId=${encodeURIComponent(String(selectedRCFE?.id || ''))}&claimDay=${encodeURIComponent(
                            claimDayKey
                          )}`
                        )
                      }
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Go to sign-off
                    </Button>
                  </div>
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {completedVisitsForSelectedRcfe.slice().reverse().slice(0, 6).map((v) => (
                      <li key={v.visitId} className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-600" />
                          <div className="min-w-0 text-sm font-medium text-slate-900 truncate">{v.memberName}</div>
                        </div>
                        <div className="shrink-0 text-xs text-slate-600">{new Date(v.completedAt).toLocaleTimeString()}</div>
                      </li>
                    ))}
                  </ul>
                  {completedVisitsForSelectedRcfe.length > 6 ? (
                    <div className="mt-2 text-xs text-amber-900/80">
                      + {completedVisitsForSelectedRcfe.length - 6} more
                    </div>
                  ) : null}
                </div>
              )}

              {completedVisitsForSelectedRcfe.length > 0 && (
                <div className="rounded-lg border bg-green-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-green-900">Drafts saved at this home</div>
                      <div className="mt-0.5 text-xs text-green-800/80">
                        {completedVisitsForSelectedRcfe.length} member{completedVisitsForSelectedRcfe.length !== 1 ? 's' : ''} done
                      </div>
                    </div>
                    {nextMemberAtSelectedRcfe ? (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleMemberSelect(nextMemberAtSelectedRcfe as any)}
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Next member
                      </Button>
                    ) : null}
                  </div>
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {completedVisitsForSelectedRcfe.slice().reverse().slice(0, 6).map((v) => (
                      <li key={v.visitId} className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <div className="min-w-0 text-sm font-medium text-slate-900 truncate">{v.memberName}</div>
                        </div>
                        <div className="shrink-0 text-xs text-slate-600">{new Date(v.completedAt).toLocaleTimeString()}</div>
                      </li>
                    ))}
                  </ul>
                  {completedVisitsForSelectedRcfe.length > 6 ? (
                    <div className="mt-2 text-xs text-slate-600">
                      + {completedVisitsForSelectedRcfe.length - 6} more
                    </div>
                  ) : null}
                </div>
              )}

              {membersAtSelectedRcfe.map((member, memberIndex) => {
                const memberKeyNorm = getMemberKey(member);
                const visited = memberKeyNorm ? Boolean(visitedByRcfeId[selectedRCFE.id]?.includes(memberKeyNorm)) : false;
                const signed = memberKeyNorm ? Boolean(signedOffByRcfeId[selectedRCFE.id]?.memberIds?.includes(memberKeyNorm)) : false;
                const monthStatus = memberKeyNorm ? monthStatuses[memberKeyNorm] : undefined;
                const claimStatus = String(monthStatus?.claimStatus || '').trim().toLowerCase();
                const isPaid = Boolean(monthStatus?.claimPaid) || claimStatus === 'paid';
                const isSubmitted = Boolean(monthStatus?.claimSubmitted) || ['submitted', 'approved', 'rejected'].includes(claimStatus);
                const hasVisitThisMonth = Boolean(monthStatus?.visitId);
                const needsSignOff = hasVisitThisMonth && !Boolean(monthStatus?.signedOff) && !isSubmitted && !isPaid;
                const draftStatus = memberKeyNorm ? draftVisitsByMemberId[memberKeyNorm] : undefined;
                const hasDraftToday = Boolean(draftStatus?.visitId) && !hasVisitThisMonth;
                return (
                  <div
                    key={memberKeyNorm || `${String(member?.name || 'member')}-${memberIndex}`}
                    className={`border rounded-lg p-4 transition-colors cursor-pointer hover:bg-gray-50 ${
                      hasVisitThisMonth || hasDraftToday ? 'bg-slate-50' : ''
                    }`}
                    onClick={() => handleMemberSelect(member)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h3 className="font-semibold truncate max-w-full">{member.name}</h3>
                          {isPaid ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
                          ) : isSubmitted ? (
                            <Badge className="bg-blue-600 hover:bg-blue-600">Submitted</Badge>
                          ) : needsSignOff ? (
                            <Badge className="bg-amber-500 hover:bg-amber-500">Needs sign-off</Badge>
                          ) : monthStatus?.signedOff ? (
                            <Badge className="bg-green-600 hover:bg-green-600">Signed off</Badge>
                          ) : hasDraftToday ? (
                            <Badge variant="outline" className="border-slate-300 text-slate-700">
                              Draft saved
                            </Badge>
                          ) : null}
                          {signed ? (
                            <Badge className="bg-green-600 hover:bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Signed off
                            </Badge>
                          ) : visited ? (
                            <Badge variant="outline" className="text-green-700 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Visited
                            </Badge>
                          ) : null}
                        </div>
                        {member.lastVisitDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last visit: {new Date(member.lastVisitDate).toLocaleDateString()}
                          </p>
                        )}
                        {hasVisitThisMonth ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Already completed this month. {isSubmitted || isPaid ? 'No additional claim allowed.' : 'Tap to edit questionnaire.'}
                          </p>
                        ) : hasDraftToday ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Draft saved for this home/day. Tap to edit, or go to Sign Off & Submit when you’re ready.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Questionnaire */}
        {currentStep === 'questionnaire' && selectedMember && (
          <div className="space-y-6">
            {/* Progress Header */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="font-semibold">{selectedMember.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedRCFE?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={restartQuestionnaire}
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restart
                    </Button>
                    {editingVisitId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void deleteCurrentDraft()}
                        disabled={isLoading}
                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete draft
                      </Button>
                    ) : null}
                    <Badge variant="outline">
                      Question {questionStep} of 6
                    </Badge>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(questionStep / 6) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Question 1: Meeting Location */}
            {questionStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>1. Where did you meet the member? <span className="text-red-500">*</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Member room number <span className="text-red-500">*</span>
                    </div>
                    <Input
                      value={questionnaire.memberRoomNumber}
                      onChange={(e) => setQuestionnaire((prev) => ({ ...prev, memberRoomNumber: e.target.value }))}
                      placeholder="e.g., 12A"
                    />
                    <div className="text-xs text-muted-foreground">Ask RCFE staff if needed.</div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { value: 'member_room', label: "Member's Room" },
                      { value: 'common_area', label: 'Common Area' },
                      { value: 'outside_grounds', label: 'Outside Grounds' },
                      { value: 'off_site', label: 'Off-Site Location' },
                      { value: 'other', label: 'Other' }
                    ].map((option) => (
                      <label key={option.value} className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="meetingLocation"
                          value={option.value}
                          checked={questionnaire.meetingLocation.location === option.value}
                          onChange={(e) => setQuestionnaire(prev => ({
                            ...prev,
                            meetingLocation: { ...prev.meetingLocation, location: e.target.value }
                          }))}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  
                  {questionnaire.meetingLocation.location === 'other' && (
                    <Input
                      placeholder="Please specify..."
                      value={questionnaire.meetingLocation.otherLocation || ''}
                      onChange={(e) => setQuestionnaire(prev => ({
                        ...prev,
                        meetingLocation: { ...prev.meetingLocation, otherLocation: e.target.value }
                      }))}
                    />
                  )}
                  
                  <Textarea
                    placeholder="Additional notes about the meeting location..."
                    value={questionnaire.meetingLocation.notes || ''}
                    onChange={(e) => setQuestionnaire(prev => ({
                      ...prev,
                      meetingLocation: { ...prev.meetingLocation, notes: e.target.value }
                    }))}
                  />
                </CardContent>
              </Card>
            )}

            {/* Question 2: Member Well-being */}
            {questionStep === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>2. How is the member doing? <span className="text-red-500">*</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={Boolean(questionnaire.memberConcerns?.nonResponsive)}
                        onCheckedChange={(v) => {
                          const next = Boolean(v);
                          setQuestionnaire((prev) => ({
                            ...prev,
                            memberConcerns: {
                              ...prev.memberConcerns,
                              nonResponsive: next,
                              nonResponsiveReason: next ? (prev.memberConcerns?.nonResponsiveReason || '') : '',
                              nonResponsiveDetails: next ? (prev.memberConcerns?.nonResponsiveDetails || '') : '',
                            },
                          }));
                        }}
                      />
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900">Member is non-responsive</div>
                        <div className="text-xs text-muted-foreground">
                          If the member can’t participate, you can still complete the visit. Ratings become optional.
                        </div>
                      </div>
                    </div>

                    {Boolean(questionnaire.memberConcerns?.nonResponsive) ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-slate-700">Reason</div>
                          <Select
                            value={String(questionnaire.memberConcerns?.nonResponsiveReason || '')}
                            onValueChange={(value) =>
                              setQuestionnaire((prev) => ({
                                ...prev,
                                memberConcerns: { ...prev.memberConcerns, nonResponsiveReason: value },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sleeping">Sleeping</SelectItem>
                              <SelectItem value="dementia">Dementia / cognitive impairment</SelectItem>
                              <SelectItem value="refused">Refused to answer</SelectItem>
                              <SelectItem value="medical">In medical distress</SelectItem>
                              <SelectItem value="language">Language barrier</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-slate-700">Details (optional)</div>
                          <Input
                            placeholder="Add details if helpful"
                            value={String(questionnaire.memberConcerns?.nonResponsiveDetails || '')}
                            onChange={(e) =>
                              setQuestionnaire((prev) => ({
                                ...prev,
                                memberConcerns: { ...prev.memberConcerns, nonResponsiveDetails: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <StarRating
                    label="Physical Health"
                    value={questionnaire.memberWellbeing.physicalHealth}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      memberWellbeing: { ...prev.memberWellbeing, physicalHealth: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Mental Health"
                    value={questionnaire.memberWellbeing.mentalHealth}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      memberWellbeing: { ...prev.memberWellbeing, mentalHealth: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Social Engagement"
                    value={questionnaire.memberWellbeing.socialEngagement}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      memberWellbeing: { ...prev.memberWellbeing, socialEngagement: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Overall Mood"
                    value={questionnaire.memberWellbeing.overallMood}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      memberWellbeing: { ...prev.memberWellbeing, overallMood: value }
                    }))}
                  />
                  
                  <Textarea
                    placeholder="Notes about member's well-being..."
                    value={questionnaire.memberWellbeing.notes}
                    onChange={(e) => setQuestionnaire(prev => ({
                      ...prev,
                      memberWellbeing: { ...prev.memberWellbeing, notes: e.target.value }
                    }))}
                  />
                </CardContent>
              </Card>
            )}

            {/* Question 3: Care Satisfaction */}
            {questionStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>3. Are they satisfied with the care received? <span className="text-red-500">*</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <StarRating
                    label="Staff Attentiveness"
                    value={questionnaire.careSatisfaction.staffAttentiveness}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      careSatisfaction: { ...prev.careSatisfaction, staffAttentiveness: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Meal Quality"
                    value={questionnaire.careSatisfaction.mealQuality}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      careSatisfaction: { ...prev.careSatisfaction, mealQuality: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Cleanliness of Room"
                    value={questionnaire.careSatisfaction.cleanlinessOfRoom}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      careSatisfaction: { ...prev.careSatisfaction, cleanlinessOfRoom: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Activities & Programs"
                    value={questionnaire.careSatisfaction.activitiesPrograms}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      careSatisfaction: { ...prev.careSatisfaction, activitiesPrograms: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Overall Satisfaction"
                    value={questionnaire.careSatisfaction.overallSatisfaction}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      careSatisfaction: { ...prev.careSatisfaction, overallSatisfaction: value }
                    }))}
                  />
                  
                  <Textarea
                    placeholder="Notes about care satisfaction..."
                    value={questionnaire.careSatisfaction.notes}
                    onChange={(e) => setQuestionnaire(prev => ({
                      ...prev,
                      careSatisfaction: { ...prev.careSatisfaction, notes: e.target.value }
                    }))}
                  />
                </CardContent>
              </Card>
            )}

            {/* Question 4: Member Concerns */}
            {questionStep === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle>4. Do they have concerns they'd like to share? <span className="text-red-500">*</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {questionnaire.memberConcerns.hasConcerns === true &&
                  !String(questionnaire.memberConcerns.detailedConcerns || '').trim() ? (
                    <div className="text-sm text-red-600">
                      Detailed description is required when the member has concerns.
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="radio"
                        name="memberHasConcerns"
                        checked={questionnaire.memberConcerns.hasConcerns === true}
                        onChange={() => setQuestionnaire(prev => ({
                          ...prev,
                          memberConcerns: { ...prev.memberConcerns, hasConcerns: true }
                        }))}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="font-medium">Member has concerns</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="radio"
                        name="memberHasConcerns"
                        checked={questionnaire.memberConcerns.hasConcerns === false}
                        onChange={() => setQuestionnaire(prev => ({
                          ...prev,
                          memberConcerns: {
                            ...prev.memberConcerns,
                            hasConcerns: false,
                            concernTypes: {
                              medical: false,
                              staff: false,
                              safety: false,
                              food: false,
                              social: false,
                              financial: false,
                              other: false
                            },
                            urgencyLevel: 'low',
                            detailedConcerns: '',
                            actionRequired: false
                          }
                        }))}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="font-medium">Member has no concerns</span>
                    </label>
                  </div>
                  
                  {questionnaire.memberConcerns.hasConcerns === true && (
                    <div className="space-y-4 border-l-4 border-orange-400 pl-4">
                      <div className="space-y-3">
                        <p className="font-medium">Select all concern types that apply:</p>
                        {[
                          { key: 'medical', label: 'Medical Issues' },
                          { key: 'staff', label: 'Staff Problems' },
                          { key: 'safety', label: 'Safety Concerns' },
                          { key: 'food', label: 'Food/Meal Issues' },
                          { key: 'social', label: 'Social/Isolation' },
                          { key: 'financial', label: 'Financial Issues' },
                          { key: 'other', label: 'Other' }
                        ].map((concern) => (
                          <label key={concern.key} className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={questionnaire.memberConcerns.concernTypes[concern.key as keyof typeof questionnaire.memberConcerns.concernTypes]}
                              onChange={(e) => setQuestionnaire(prev => ({
                                ...prev,
                                memberConcerns: {
                                  ...prev.memberConcerns,
                                  concernTypes: {
                                    ...prev.memberConcerns.concernTypes,
                                    [concern.key]: e.target.checked
                                  }
                                }
                              }))}
                              className="h-4 w-4 text-blue-600"
                            />
                            <span>{concern.label}</span>
                          </label>
                        ))}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-2">Urgency Level:</label>
                        <Select
                          value={questionnaire.memberConcerns.urgencyLevel}
                          onValueChange={(value) => setQuestionnaire(prev => ({
                            ...prev,
                            memberConcerns: { ...prev.memberConcerns, urgencyLevel: value }
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">🚨 CRITICAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          Detailed description of concerns <span className="text-red-500">*</span>
                        </div>
                        <Textarea
                          placeholder="Detailed description of concerns..."
                          value={questionnaire.memberConcerns.detailedConcerns}
                          onChange={(e) => setQuestionnaire(prev => ({
                            ...prev,
                            memberConcerns: { ...prev.memberConcerns, detailedConcerns: e.target.value }
                          }))}
                          className={
                            questionnaire.memberConcerns.hasConcerns === true &&
                            !String(questionnaire.memberConcerns.detailedConcerns || '').trim()
                              ? 'border-red-300 focus-visible:ring-red-300'
                              : undefined
                          }
                        />
                      </div>
                      
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={questionnaire.memberConcerns.actionRequired}
                          onChange={(e) => setQuestionnaire(prev => ({
                            ...prev,
                            memberConcerns: { ...prev.memberConcerns, actionRequired: e.target.checked }
                          }))}
                          className="h-4 w-4 text-red-600"
                        />
                        <span className="font-medium text-red-600 flex items-center gap-2">
                          <Flag className="h-4 w-4" />
                          FLAG FOR IMMEDIATE ATTENTION
                        </span>
                      </label>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Question 5: RCFE Assessment */}
            {questionStep === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle>5. What is your impression of the RCFE and care received? <span className="text-red-500">*</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <StarRating
                    label="Facility Condition"
                    value={questionnaire.rcfeAssessment.facilityCondition}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      rcfeAssessment: { ...prev.rcfeAssessment, facilityCondition: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Staff Professionalism"
                    value={questionnaire.rcfeAssessment.staffProfessionalism}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      rcfeAssessment: { ...prev.rcfeAssessment, staffProfessionalism: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Safety Compliance"
                    value={questionnaire.rcfeAssessment.safetyCompliance}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      rcfeAssessment: { ...prev.rcfeAssessment, safetyCompliance: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Care Quality"
                    value={questionnaire.rcfeAssessment.careQuality}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      rcfeAssessment: { ...prev.rcfeAssessment, careQuality: value }
                    }))}
                  />
                  
                  <StarRating
                    label="Overall Rating"
                    value={questionnaire.rcfeAssessment.overallRating}
                    onChange={(value) => setQuestionnaire(prev => ({
                      ...prev,
                      rcfeAssessment: { ...prev.rcfeAssessment, overallRating: value }
                    }))}
                  />
                  
                  <Textarea
                    placeholder="Notes about RCFE assessment..."
                    value={questionnaire.rcfeAssessment.notes}
                    onChange={(e) => setQuestionnaire(prev => ({
                      ...prev,
                      rcfeAssessment: { ...prev.rcfeAssessment, notes: e.target.value }
                    }))}
                  />
                  
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={questionnaire.rcfeAssessment.flagForReview}
                      onChange={(e) => setQuestionnaire(prev => ({
                        ...prev,
                        rcfeAssessment: { ...prev.rcfeAssessment, flagForReview: e.target.checked }
                      }))}
                      className="h-4 w-4 text-red-600"
                    />
                    <span className="font-medium text-red-600 flex items-center gap-2">
                      <Flag className="h-4 w-4" />
                      FLAG RCFE FOR REVIEW
                    </span>
                  </label>
                </CardContent>
              </Card>
            )}

            {/* Question 6: Summary & Submit */}
            {questionStep === 6 && (
              <Card>
                <CardHeader>
                  <CardTitle>6. Visit Summary <span className="text-red-500">*</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Total Score:</span>
                      <Badge variant={questionnaire.visitSummary.totalScore >= 70 ? "default" : "destructive"}>
                        {questionnaire.visitSummary.totalScore} / 100
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-medium">Month:</span>
                      <span className="text-sm text-muted-foreground">{visitMonthLabel || '—'}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Quality Rating:</span>
                      <span className={`font-medium ${
                        questionnaire.visitSummary.totalScore >= 80 ? 'text-green-600' :
                        questionnaire.visitSummary.totalScore >= 70 ? 'text-yellow-600' :
                        questionnaire.visitSummary.totalScore >= 60 ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {questionnaire.visitSummary.totalScore >= 80 ? 'Excellent' :
                         questionnaire.visitSummary.totalScore >= 70 ? 'Good' :
                         questionnaire.visitSummary.totalScore >= 60 ? 'Fair' :
                         'Needs Attention'}
                      </span>
                    </div>
                    
                    {questionnaire.visitSummary.flagged && (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">This visit has been flagged for review</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Member sign-off (optional)</div>
                    <div className="mt-1 text-xs text-slate-600">
                      If the member is able, they can acknowledge this questionnaire with a typed signature.
                    </div>

                    <label className="mt-3 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(questionnaire.memberSignoff?.acknowledged)}
                        onChange={(e) =>
                          setQuestionnaire((prev) => ({
                            ...prev,
                            memberSignoff: {
                              ...prev.memberSignoff,
                              acknowledged: e.target.checked,
                            },
                          }))
                        }
                        className="mt-1 h-4 w-4"
                      />
                      <span>Member acknowledged this visit/questionnaire</span>
                    </label>

                    {questionnaire.memberSignoff?.acknowledged ? (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Member signature (type full name)</label>
                          <Input
                            value={String(questionnaire.memberSignoff?.signatureName || '')}
                            onChange={(e) =>
                              setQuestionnaire((prev) => ({
                                ...prev,
                                memberSignoff: {
                                  ...prev.memberSignoff,
                                  signatureName: e.target.value,
                                  signedAt: prev.memberSignoff?.signedAt || new Date().toISOString(),
                                },
                              }))
                            }
                            placeholder="Type full name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Signed at</label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input value={String(questionnaire.memberSignoff?.signedAt || '')} readOnly />
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full sm:w-auto"
                              onClick={() =>
                                setQuestionnaire((prev) => ({
                                  ...prev,
                                  memberSignoff: {
                                    ...prev.memberSignoff,
                                    signedAt: new Date().toISOString(),
                                  },
                                }))
                              }
                            >
                              Set time to now
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  
                </CardContent>
              </Card>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={prevQuestion}
                disabled={questionStep === 1}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              
              {questionStep < 6 ? (
                <Button onClick={nextQuestion}>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={submitQuestionnaire}
                  disabled={isLoading || validateCompleteForm().length > 0}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                >
                  {isLoading ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : validateCompleteForm().length > 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Complete All Fields ({validateCompleteForm().length} missing)
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Save Draft
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Sign-Off Sheet */}
        {currentStep === 'sign-off' && selectedRCFE && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Visit Sign-Off Sheet</h2>
                <p className="text-muted-foreground">{selectedRCFE.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep('select-member')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Members
              </Button>
            </div>

            {/* Completed Visits Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Completed Visits ({completedVisitsForSelectedRcfe.length})
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Select the members included in this sign-off. Leave unchecked if you will return later to visit/sign off more members at this RCFE.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedVisitsForSelectedRcfe.length === 0 ? (
                    <p className="text-muted-foreground">No visits completed yet. Please complete member questionnaires first.</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                          Selected for sign-off: <span className="font-semibold text-slate-900">{selectedVisitsForSignoff.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSelectedSignoffVisitIds(
                                completedVisitsForSelectedRcfe.map((v) => String(v.visitId || '').trim()).filter(Boolean)
                              )
                            }
                          >
                            Select all
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSignoffVisitIds([])}>
                            Clear
                          </Button>
                        </div>
                      </div>
                      {completedVisitsForSelectedRcfe.map((visit) => {
                        const vid = String(visit.visitId || '').trim();
                        const checked = selectedSignoffVisitIds.includes(vid);
                        return (
                          <div key={visit.visitId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const want = Boolean(next);
                                  setSelectedSignoffVisitIds((prev) => {
                                    const set = new Set(prev);
                                    if (want) set.add(vid);
                                    else set.delete(vid);
                                    return Array.from(set);
                                  });
                                }}
                              />
                              <div>
                                <p className="font-medium">{visit.memberName}</p>
                                <p className="text-sm text-muted-foreground">
                                  Completed at {new Date(visit.completedAt).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {visit.flagged && (
                                <Badge variant="destructive" className="text-xs">
                                  <Flag className="h-3 w-3 mr-1" />
                                  Flagged
                                </Badge>
                              )}
                              <Badge variant="secondary">Verified</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* RCFE Staff Sign-Off */}
            {selectedVisitsForSignoff.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    RCFE Staff Verification
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    An RCFE staff member must verify that all selected members were visited by the social worker.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Staff Name *</label>
                      <Input
                        value={signOffData.rcfeStaffName}
                        onChange={(e) => setSignOffData(prev => ({...prev, rcfeStaffName: e.target.value}))}
                        placeholder="Enter full name"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Staff Title *</label>
                      <Input
                        value={signOffData.rcfeStaffTitle}
                        onChange={(e) => setSignOffData(prev => ({...prev, rcfeStaffTitle: e.target.value}))}
                        placeholder="e.g., Administrator, Nurse, etc."
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Electronic Signature */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Electronic Signature *</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      {signOffData.signature ? (
                        <div className="space-y-2">
                          <CheckCircle className="h-8 w-8 text-green-600 mx-auto" />
                          <p className="font-medium text-green-600">Signature Captured</p>
                          <p className="text-sm text-muted-foreground">
                            Signed by: {signOffData.rcfeStaffName}
                          </p>
                          <p className={`text-xs ${signOffData.locationVerified ? 'text-green-600' : 'text-amber-600'}`}>
                            {signOffData.locationVerified ? 'Location verified' : 'Location not verified'}
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSignOffData(prev => ({
                              ...prev,
                              signature: '',
                              signedAt: '',
                              geolocation: null,
                              locationVerified: false
                            }))}
                          >
                            Clear Signature
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="h-8 w-8 border-2 border-gray-400 rounded mx-auto"></div>
                          <p className="text-muted-foreground">
                            {!signOffData.rcfeStaffName.trim() 
                              ? "Enter staff name first, then tap to sign" 
                              : "Tap to sign electronically"}
                          </p>
                          <div className="space-y-2">
                            <Button
                              onClick={async () => {
                              console.log('🖊️ Electronic signature button clicked');
                              
                              if (!signOffData.rcfeStaffName.trim()) {
                                console.log('❌ Staff name missing');
                                toast({
                                  title: "Name Required",
                                  description: "Please enter staff name before signing",
                                  variant: "destructive"
                                });
                                return;
                              }
                              
                              console.log('📍 Requesting geolocation...');
                              
                              // Check if geolocation is supported
                              if (!navigator.geolocation) {
                                console.log('❌ Geolocation not supported');
                                toast({
                                  title: "Geolocation Not Supported",
                                  description: "Your browser doesn't support location services. Please use a modern browser.",
                                  variant: "destructive"
                                });
                                return;
                              }
                              
                              // Show loading state
                              toast({
                                title: "Getting Location...",
                                description: "Please allow location access when prompted",
                                duration: 3000
                              });
                              
                              // Capture geolocation
                              try {
                                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                                  navigator.geolocation.getCurrentPosition(
                                    resolve, 
                                    reject, 
                                    {
                                      enableHighAccuracy: true,
                                      timeout: 15000, // Increased timeout
                                      maximumAge: 60000
                                    }
                                  );
                                });
                                
                                console.log('✅ Location captured:', {
                                  lat: position.coords.latitude,
                                  lng: position.coords.longitude,
                                  accuracy: position.coords.accuracy
                                });
                                
                                setSignOffData(prev => ({
                                  ...prev,
                                  signature: `${prev.rcfeStaffName} - ${new Date().toLocaleString()}`,
                                  signedAt: new Date().toISOString(),
                                  geolocation: {
                                    latitude: position.coords.latitude,
                                    longitude: position.coords.longitude,
                                    accuracy: position.coords.accuracy,
                                    timestamp: position.timestamp
                                  },
                                  locationVerified: true
                                }));
                                
                                toast({
                                  title: "✅ Signature Captured!",
                                  description: `Electronic signature verified at location (±${Math.round(position.coords.accuracy)}m accuracy)`,
                                  duration: 5000
                                });
                              } catch (error: any) {
                                console.error('❌ Geolocation error:', {
                                  code: error?.code,
                                  message: error?.message,
                                  error: error
                                });
                                
                                let errorMessage = "Please enable location services for signature verification";
                                
                                if (error?.code === 1) {
                                  errorMessage = "Location access denied. Please allow location permissions and try again.";
                                } else if (error?.code === 2) {
                                  errorMessage = "Location unavailable. Please check your GPS/WiFi and try again.";
                                } else if (error?.code === 3) {
                                  errorMessage = "Location request timed out. Please try again.";
                                }
                                
                                toast({
                                  title: "Location Error",
                                  description: errorMessage,
                                  variant: "destructive",
                                  duration: 7000
                                });
                              }
                              }}
                              className="w-full"
                              disabled={!signOffData.rcfeStaffName.trim()}
                            >
                              <MapPin className="h-4 w-4 mr-2" />
                              Sign & Verify Location
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Visit Invoice / Receipt */}
                  {signOffData.signature ? (
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Visit invoice / sign-off receipt</div>
                          <div className="mt-0.5 text-xs text-slate-600">
                            For RCFE records and billing verification. (This is not emailed.)
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            try {
                              if (typeof window !== 'undefined') window.print();
                            } catch {
                              // ignore
                            }
                          }}
                        >
                          Print
                        </Button>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-md border bg-white p-3">
                          <div className="text-[11px] font-medium text-slate-500">Home / RCFE</div>
                          <div className="mt-0.5 text-sm font-medium text-slate-900">{selectedRCFE.name}</div>
                          <div className="mt-0.5 text-xs text-slate-600">{selectedRCFE.address}</div>
                        </div>

                        <div className="rounded-md border bg-white p-3">
                          <div className="text-[11px] font-medium text-slate-500">Visit date</div>
                          <div className="mt-0.5 text-sm text-slate-900">
                            {(() => {
                              const dates = Array.from(
                                new Set(
                                  (selectedVisitsForSignoff || [])
                                    .map((v) => new Date(v.completedAt).toLocaleDateString())
                                    .filter(Boolean)
                                )
                              );
                              if (dates.length === 0) return '—';
                              if (dates.length === 1) return dates[0];
                              return `${dates[0]} – ${dates[dates.length - 1]}`;
                            })()}
                          </div>
                        </div>

                        <div className="rounded-md border bg-white p-3">
                          <div className="text-[11px] font-medium text-slate-500">Member(s) visited</div>
                          <div className="mt-1 text-sm text-slate-900">
                            {(selectedVisitsForSignoff || []).length === 0 ? (
                              <span className="text-slate-500">—</span>
                            ) : (
                              <ul className="list-disc pl-5 space-y-0.5">
                                {selectedVisitsForSignoff.map((v) => (
                                  <li key={v.visitId}>{v.memberName}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        <div className="rounded-md border bg-white p-3">
                          <div className="text-[11px] font-medium text-slate-500">Social worker</div>
                          <div className="mt-0.5 text-sm text-slate-900">
                            {String(user?.displayName || user?.email || user?.uid || '').trim() || '—'}
                          </div>
                        </div>

                        <div className="rounded-md border bg-white p-3">
                          <div className="text-[11px] font-medium text-slate-500">Signed by</div>
                          <div className="mt-0.5 text-sm text-slate-900">{signOffData.rcfeStaffName || '—'}</div>
                          <div className="mt-0.5 text-xs text-slate-600">{signOffData.rcfeStaffTitle || ''}</div>
                        </div>

                        <div className="rounded-md border bg-white p-3">
                          <div className="text-[11px] font-medium text-slate-500">Sign-off time</div>
                          <div className="mt-0.5 text-sm text-slate-900">
                            {signOffData.signedAt ? new Date(signOffData.signedAt).toLocaleString() : '—'}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600">
                            {signOffData.locationVerified ? 'Location verified' : 'Location not verified'}
                          </div>
                        </div>

                        <div className="rounded-md border bg-white p-3 md:col-span-2">
                          <div className="text-[11px] font-medium text-slate-500">Invoice amount (preview)</div>
                          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="rounded-md border bg-slate-50 px-3 py-2">
                              <div className="text-[11px] text-slate-600">Member visit fees</div>
                              <div className="text-sm font-semibold text-slate-900">
                                {selectedVisitsForSignoff.length} × ${VISIT_FEE_RATE} = ${selectedVisitsForSignoff.length * VISIT_FEE_RATE}
                              </div>
                            </div>
                            <div className="rounded-md border bg-slate-50 px-3 py-2">
                              <div className="text-[11px] text-slate-600">Daily gas allowance</div>
                              <div className="text-sm font-semibold text-slate-900">
                                ${selectedVisitsForSignoff.length > 0 ? DAILY_GAS_AMOUNT : 0}
                              </div>
                              <div className="text-[11px] text-slate-600">Once per day across all homes</div>
                            </div>
                            <div className="rounded-md border bg-slate-50 px-3 py-2">
                              <div className="text-[11px] text-slate-600">Daily total (gas counted once)</div>
                              <div className="text-sm font-semibold text-slate-900">
                                ${selectedVisitsForSignoff.length * VISIT_FEE_RATE + (selectedVisitsForSignoff.length > 0 ? DAILY_GAS_AMOUNT : 0)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Submit Sign-Off */}
                  {signOffData.signature && (
                    <div className="pt-4 border-t">
                      <Button
                        onClick={async () => {
                          setIsLoading(true);
                          try {
                            const rcfeVisits = selectedVisitsForSignoff.slice();
                            if (rcfeVisits.length === 0) {
                              toast({
                                title: 'Select at least 1 member',
                                description: 'Choose which completed members are included in this sign-off.',
                                variant: 'destructive',
                              });
                              return;
                            }

                            const claimDay =
                              String(rcfeVisits?.[0]?.claimDay || questionnaire.visitDate || '').slice(0, 10) ||
                              new Date().toISOString().slice(0, 10);
                            const visitCount = rcfeVisits.length;
                            const visitFees = visitCount * VISIT_FEE_RATE;
                            const gasAmount = visitCount > 0 ? DAILY_GAS_AMOUNT : 0;
                            const totalAmount = visitFees + gasAmount;

                            const signOffSubmission = {
                              rcfeId: selectedRCFE.id,
                              rcfeName: selectedRCFE.name,
                              socialWorkerId: user?.email || user?.displayName || 'Billy Buckhalter',
                              socialWorkerUid: user?.uid || null,
                              socialWorkerEmail: (user?.email || '').toLowerCase() || null,
                              socialWorkerName: user?.displayName || user?.email || null,
                              claimDay,
                              completedVisits: rcfeVisits,
                              signOffData,
                              invoice: {
                                visitFeeRate: VISIT_FEE_RATE,
                                dailyGasAmount: DAILY_GAS_AMOUNT,
                                visitCount,
                                visitFees,
                                gasAmount,
                                totalAmount,
                              },
                              submittedAt: new Date().toISOString()
                            };

                            const idToken = await getIdToken();
                            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                            if (idToken) headers.authorization = `Bearer ${idToken}`;
                            const response = await fetch('/api/sw-visits/sign-off', {
                              method: 'POST',
                              headers,
                              body: JSON.stringify(signOffSubmission)
                            });

                            const result = await response.json();
                            if (response.ok && result?.success) {
                              const locationMessage = result.locationVerified
                                ? 'Location verified.'
                                : 'Location not verified (missing geolocation).';
                              toast({
                                title: "Sign-Off Complete! 🎉",
                                description: `All ${visitCount} visit${visitCount !== 1 ? 's' : ''} for ${selectedRCFE.name} submitted. Home subtotal: $${visitFees}. Daily gas: $${gasAmount} (once/day). ${locationMessage}`
                              });
                              
                              // Mark RCFE/member checkmarks for this home
                              setSignedOffByRcfeId((prev) => ({
                                ...prev,
                                [selectedRCFE.id]: {
                                  signedAt: String(signOffData.signedAt || new Date().toISOString()),
                                  staffName: String(signOffData.rcfeStaffName || '').trim(),
                                  memberIds: Array.from(
                                    new Set([
                                      ...((prev[selectedRCFE.id]?.memberIds || []) as string[]),
                                      ...rcfeVisits.map((v) => String(v.memberId || '').trim()).filter(Boolean),
                                    ])
                                  ),
                                  claimDay,
                                  visitCount,
                                  visitFees,
                                  gasAmount,
                                  totalAmount,
                                },
                              }));

                              // Remove only the selected visits (keeps other completed members at this RCFE for later)
                              const signedVisitIds = new Set(rcfeVisits.map((v) => String(v.visitId || '').trim()).filter(Boolean));
                              setCompletedVisits((prev) =>
                                prev.filter((v) => {
                                  if (String(v.rcfeId || '').trim() !== String(selectedRCFE.id || '').trim()) return true;
                                  const vid = String(v.visitId || '').trim();
                                  return !signedVisitIds.has(vid);
                                })
                              );
                              setSignOffData({
                                rcfeStaffName: '',
                                rcfeStaffTitle: '',
                                signature: '',
                                signedAt: '',
                                geolocation: null,
                                locationVerified: false
                              });
                              setCurrentStep('select-member');
                            } else {
                              throw new Error(result?.error || 'Sign-off submission failed');
                            }
                          } catch (error) {
                            toast({
                              title: "Submission Error",
                              description: "Failed to submit sign-off. Please try again.",
                              variant: "destructive"
                            });
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        className="w-full"
                        size="lg"
                        disabled={isLoading}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {isLoading ? 'Submitting...' : `Submit Final Sign-Off (${selectedVisitsForSignoff.length} visits)`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Visit Completed - Navigation Options */}
        {currentStep === 'visit-completed' && (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-green-800 mb-2">Draft Saved</h2>
                <p className="text-green-700">
                  Your questionnaire draft has been saved. When you’re done at this RCFE, have staff check the list and sign off to submit questionnaires and the claim.
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-center">What would you like to do next?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {completedVisitsForSelectedRcfe.length > 0 && (
                  <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Drafts saved at {selectedRCFE?.name}</div>
                        <div className="mt-0.5 text-xs text-slate-600">
                          {completedVisitsForSelectedRcfe.length} draft{completedVisitsForSelectedRcfe.length !== 1 ? 's' : ''} • ready for staff sign-off when you’re done at this home
                        </div>
                      </div>
                      {nextMemberAtSelectedRcfe ? (
                        <Button type="button" size="sm" onClick={() => handleMemberSelect(nextMemberAtSelectedRcfe as any)}>
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Next member
                        </Button>
                      ) : (
                        <Badge className="bg-green-600 hover:bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Home complete
                        </Badge>
                      )}
                    </div>
                    <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {completedVisitsForSelectedRcfe.slice().reverse().slice(0, 8).map((v) => (
                        <li key={v.visitId} className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <div className="text-sm font-medium text-slate-900">{v.memberName}</div>
                          </div>
                          <div className="text-xs text-slate-600">{new Date(v.completedAt).toLocaleTimeString()}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Continue at Same RCFE */}
                  <Button
                    onClick={() => setCurrentStep('select-member')}
                    className="h-auto p-6 flex-col space-y-2"
                    variant="outline"
                  >
                    <User className="h-8 w-8 text-blue-600" />
                    <div className="text-center">
                      <div className="font-semibold">{nextMemberAtSelectedRcfe ? 'Continue to Next Member' : 'Visit Another Member'}</div>
                      <div className="text-sm text-muted-foreground">
                        Continue at {selectedRCFE?.name}
                      </div>
                    </div>
                  </Button>

                  {/* Go to Different RCFE */}
                  <Button
                    onClick={() => {
                      setCurrentStep('select-rcfe');
                      setSelectedRCFE(null);
                      setSelectedMember(null);
                      setQuestionStep(1);
                    }}
                    className="h-auto p-6 flex-col space-y-2"
                    variant="outline"
                  >
                    <Building className="h-8 w-8 text-purple-600" />
                    <div className="text-center">
                      <div className="font-semibold">Visit Different RCFE</div>
                      <div className="text-sm text-muted-foreground">
                        Select another facility
                      </div>
                    </div>
                  </Button>
                </div>

                {/* Sign-Off Option (if visits completed) */}
                {completedVisitsForSelectedRcfe.length > 0 && (
                  <div className="pt-4 border-t">
                    <Button
                      onClick={() =>
                        router.push(
                          `/sw-portal/sign-off?rcfeId=${encodeURIComponent(String(selectedRCFE?.id || ''))}&claimDay=${encodeURIComponent(
                            claimDayKey
                          )}`
                        )
                      }
                      className="w-full h-auto p-4 bg-green-600 hover:bg-green-700"
                    >
                      <div className="flex items-center justify-center space-x-3">
                        <CheckCircle className="h-6 w-6" />
                        <div className="text-center">
                          <div className="font-semibold">Sign Off & Submit</div>
                          <div className="text-sm opacity-90">
                            {completedVisitsForSelectedRcfe.length} draft{completedVisitsForSelectedRcfe.length !== 1 ? 's' : ''} ready at this home
                          </div>
                        </div>
                      </div>
                    </Button>
                    <div className="mt-3 text-center text-sm text-muted-foreground">
                      Have all members been visited at this RCFE?{' '}
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/sw-portal/sign-off?rcfeId=${encodeURIComponent(String(selectedRCFE?.id || ''))}&claimDay=${encodeURIComponent(
                          claimDayKey
                        )}`}
                      >
                        Go to Sign Off Page
                      </Link>
                      .
                    </div>
                  </div>
                )}

                {/* Visit Summary */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <h3 className="font-medium text-gray-900">Today's Progress</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Completed Visits:</span>
                      <span className="ml-2 font-semibold text-green-600">{completedVisits.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Current RCFE:</span>
                      <span className="ml-2 font-semibold">{selectedRCFE?.name || 'None'}</span>
                    </div>
                  </div>
                  {completedVisits.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Last visit: {completedVisits[completedVisits.length - 1]?.memberName} at {new Date(completedVisits[completedVisits.length - 1]?.completedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}