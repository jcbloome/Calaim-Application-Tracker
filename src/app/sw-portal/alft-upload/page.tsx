'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useStorage } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UploadCloud, Info } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ExactAlftQuestionnaire, createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';

type UploadedFile = { fileName: string; downloadURL: string; storagePath: string };
type AssessmentPurpose = 'Initial' | 'Change of Condition' | 'Review';
type LocationType = 'Private Residence' | 'Assisted Living Facility (ALF)' | 'Nursing Facility' | 'Hospital' | 'Adult Day Care' | 'Other';
type AssessmentSite = 'Home' | 'Nursing Facility' | 'Hospital' | 'ALF' | 'Adult Day Care' | 'Other';
type ApsRisk = 'High' | 'Intermediate' | 'Low' | 'Not Applicable';
type YesNo = 'Yes' | 'No';
type FunctionLevel = 'Independent' | 'Needs Assistance' | 'Dependent' | 'N/A';
type BehaviorFrequency = 'None' | 'Rarely' | 'Sometimes' | 'Often' | 'Daily';

const todayLocalKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const sanitizePathSegment = (value: string) =>
  String(value || '')
    .trim()
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 140);

export default function SwAlftUploadPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const auth = useAuth();
  const storage = useStorage();
  const { user, socialWorkerData, isSocialWorker, isLoading } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim();
  const swProfileName = String((socialWorkerData as any)?.displayName || (user as any)?.displayName || '').trim();
  const swRealName = swProfileName && !swProfileName.includes('@') ? swProfileName : '';
  const swDisplayName = swRealName || swEmail || 'Social Worker';

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [files, setFiles] = useState<FileList | null>(null);

  const [memberFirstName, setMemberFirstName] = useState('');
  const [memberLastName, setMemberLastName] = useState('');
  const [uploadDate, setUploadDate] = useState<string>(() => todayLocalKey()); // YYYY-MM-DD
  const [kaiserMrn, setKaiserMrn] = useState('');
  const [socialWorkerName, setSocialWorkerName] = useState(swRealName);
  const [facilityName, setFacilityName] = useState('');
  const [priorityLevel, setPriorityLevel] = useState('Routine');
  const [transitionSummary, setTransitionSummary] = useState('');
  const [barriersAndRisks, setBarriersAndRisks] = useState('');
  const [requestedActions, setRequestedActions] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [planId, setPlanId] = useState('');
  const [assessorReferralDate, setAssessorReferralDate] = useState('');
  const [assessmentPurpose, setAssessmentPurpose] = useState<AssessmentPurpose>('Initial');
  const [hasOtherResponder, setHasOtherResponder] = useState<YesNo>('No');
  const [otherResponderName, setOtherResponderName] = useState('');
  const [otherResponderRelationship, setOtherResponderRelationship] = useState('');
  const [memberMiddleName, setMemberMiddleName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberDob, setMemberDob] = useState('');
  const [memberSex, setMemberSex] = useState('');
  const [memberRace, setMemberRace] = useState('');
  const [memberEthnicity, setMemberEthnicity] = useState('');
  const [memberPrimaryLanguage, setMemberPrimaryLanguage] = useState('');
  const [limitedEnglish, setLimitedEnglish] = useState<YesNo>('No');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [currentStreet, setCurrentStreet] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [currentState, setCurrentState] = useState('');
  const [currentZip, setCurrentZip] = useState('');
  const [currentLocationType, setCurrentLocationType] = useState<LocationType>('Private Residence');
  const [currentLocationOther, setCurrentLocationOther] = useState('');
  const [homeStreet, setHomeStreet] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeState, setHomeState] = useState('');
  const [homeZip, setHomeZip] = useState('');
  const [mailStreet, setMailStreet] = useState('');
  const [mailCity, setMailCity] = useState('');
  const [mailState, setMailState] = useState('');
  const [mailZip, setMailZip] = useState('');
  const [assessmentSite, setAssessmentSite] = useState<AssessmentSite>('Home');
  const [apsRisk, setApsRisk] = useState<ApsRisk>('Not Applicable');
  const [imminentNursingRisk, setImminentNursingRisk] = useState<YesNo>('No');
  const [onAlwpWaitlist, setOnAlwpWaitlist] = useState<YesNo>('No');
  const [alwpAgency, setAlwpAgency] = useState('');
  const [previousUnsuccessfulPlacements, setPreviousUnsuccessfulPlacements] = useState<YesNo>('No');
  const [previousPlacementExplanation, setPreviousPlacementExplanation] = useState('');
  const [hasPrimaryCaregiver, setHasPrimaryCaregiver] = useState<YesNo>('No');
  const [livingSituation, setLivingSituation] = useState('');
  const [incomeSources, setIncomeSources] = useState('');
  const [cognitionOrientation, setCognitionOrientation] = useState('');
  const [shortTermMemoryImpairment, setShortTermMemoryImpairment] = useState<YesNo>('No');
  const [longTermMemoryImpairment, setLongTermMemoryImpairment] = useState<YesNo>('No');
  const [confusionEpisodes, setConfusionEpisodes] = useState<YesNo>('No');
  const [wanderingRisk, setWanderingRisk] = useState<YesNo>('No');
  const [cognitiveNotes, setCognitiveNotes] = useState('');
  const [majorDiagnoses, setMajorDiagnoses] = useState('');
  const [fallHistoryPast6Months, setFallHistoryPast6Months] = useState<YesNo>('No');
  const [fallCountPast6Months, setFallCountPast6Months] = useState('');
  const [erVisitsPast6Months, setErVisitsPast6Months] = useState('');
  const [hospitalizationsPast6Months, setHospitalizationsPast6Months] = useState('');
  const [recentWeightLoss, setRecentWeightLoss] = useState<YesNo>('No');
  const [painConcerns, setPainConcerns] = useState<YesNo>('No');
  const [skinBreakdownRisk, setSkinBreakdownRisk] = useState<YesNo>('No');
  const [oxygenUse, setOxygenUse] = useState<YesNo>('No');
  const [oxygenDetails, setOxygenDetails] = useState('');
  const [durableMedicalEquipment, setDurableMedicalEquipment] = useState('');
  const [adlBathing, setAdlBathing] = useState<FunctionLevel>('Needs Assistance');
  const [adlDressing, setAdlDressing] = useState<FunctionLevel>('Needs Assistance');
  const [adlToileting, setAdlToileting] = useState<FunctionLevel>('Needs Assistance');
  const [adlTransferring, setAdlTransferring] = useState<FunctionLevel>('Needs Assistance');
  const [adlAmbulation, setAdlAmbulation] = useState<FunctionLevel>('Needs Assistance');
  const [adlEating, setAdlEating] = useState<FunctionLevel>('Needs Assistance');
  const [iadlMedicationManagement, setIadlMedicationManagement] = useState<FunctionLevel>('Needs Assistance');
  const [iadlMealPrep, setIadlMealPrep] = useState<FunctionLevel>('Needs Assistance');
  const [iadlHousekeeping, setIadlHousekeeping] = useState<FunctionLevel>('Needs Assistance');
  const [iadlLaundry, setIadlLaundry] = useState<FunctionLevel>('Needs Assistance');
  const [iadlTransportation, setIadlTransportation] = useState<FunctionLevel>('Needs Assistance');
  const [iadlShopping, setIadlShopping] = useState<FunctionLevel>('Needs Assistance');
  const [iadlFinances, setIadlFinances] = useState<FunctionLevel>('Needs Assistance');
  const [iadlPhoneUse, setIadlPhoneUse] = useState<FunctionLevel>('Needs Assistance');
  const [healthConditionsAndTherapies, setHealthConditionsAndTherapies] = useState('');
  const [mentalHealthDiagnosis, setMentalHealthDiagnosis] = useState('');
  const [depressionSymptoms, setDepressionSymptoms] = useState<BehaviorFrequency>('None');
  const [anxietySymptoms, setAnxietySymptoms] = useState<BehaviorFrequency>('None');
  const [agitationBehaviors, setAgitationBehaviors] = useState<BehaviorFrequency>('None');
  const [aggressionBehaviors, setAggressionBehaviors] = useState<BehaviorFrequency>('None');
  const [sleepDisturbance, setSleepDisturbance] = useState<BehaviorFrequency>('None');
  const [behaviorInterventions, setBehaviorInterventions] = useState('');
  const [nutritionNeeds, setNutritionNeeds] = useState('');
  const [swMedicationSummary, setSwMedicationSummary] = useState('');
  const [primaryPhysicianName, setPrimaryPhysicianName] = useState('');
  const [primaryPhysicianPhone, setPrimaryPhysicianPhone] = useState('');
  const [advanceDirectiveInPlace, setAdvanceDirectiveInPlace] = useState<YesNo>('No');
  const [advanceDirectiveNotes, setAdvanceDirectiveNotes] = useState('');
  const [environmentalRisks, setEnvironmentalRisks] = useState('');
  const [visionStatus, setVisionStatus] = useState('');
  const [hearingStatus, setHearingStatus] = useState('');
  const [livingArrangementDetails, setLivingArrangementDetails] = useState('');
  const [medicationTable, setMedicationTable] = useState('');
  const [rnMswCommentary, setRnMswCommentary] = useState('');
  const [rnReviewerName, setRnReviewerName] = useState('');
  const [rnReviewerDate, setRnReviewerDate] = useState('');
  const [mswSignatureName, setMswSignatureName] = useState('');
  const [mswSignatureDate, setMswSignatureDate] = useState('');
  const [exactPacketAnswers, setExactPacketAnswers] = useState<Record<string, string | string[]>>(() =>
    createInitialExactAlftAnswers()
  );
  const prefillAppliedRef = useRef(false);

  const prefillFromQuery = useMemo(
    () => ({
      firstName: (searchParams.get('memberFirstName') || searchParams.get('firstName') || '').trim(),
      lastName: (searchParams.get('memberLastName') || searchParams.get('lastName') || '').trim(),
      dob: (searchParams.get('memberDob') || searchParams.get('dob') || '').trim(),
      mrn: (searchParams.get('memberMrn') || searchParams.get('mrn') || '').trim(),
      address: (searchParams.get('currentAddress') || searchParams.get('address') || '').trim(),
      city: (searchParams.get('currentCity') || searchParams.get('city') || '').trim(),
      state: (searchParams.get('currentState') || searchParams.get('state') || '').trim(),
      zip: (searchParams.get('currentZip') || searchParams.get('zip') || '').trim(),
      phone: (searchParams.get('memberPhone') || searchParams.get('phone') || '').trim(),
    }),
    [searchParams]
  );

  // If the SW profile name loads after first render, auto-populate the field.
  useEffect(() => {
    if (!swRealName) return;
    setSocialWorkerName((prev) => (prev && !prev.includes('@') ? prev : swRealName));
  }, [swRealName]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillFromQuery.firstName && !prefillFromQuery.lastName && !prefillFromQuery.mrn) return;
    prefillAppliedRef.current = true;

    if (prefillFromQuery.firstName) setMemberFirstName(prefillFromQuery.firstName);
    if (prefillFromQuery.lastName) setMemberLastName(prefillFromQuery.lastName);
    if (prefillFromQuery.mrn) setKaiserMrn(prefillFromQuery.mrn);
    if (prefillFromQuery.dob) setMemberDob(prefillFromQuery.dob);
    if (prefillFromQuery.phone) setMemberPhone(prefillFromQuery.phone);
    if (prefillFromQuery.address) setCurrentStreet(prefillFromQuery.address);
    if (prefillFromQuery.city) setCurrentCity(prefillFromQuery.city);
    if (prefillFromQuery.state) setCurrentState(prefillFromQuery.state);
    if (prefillFromQuery.zip) setCurrentZip(prefillFromQuery.zip);

    setExactPacketAnswers((prev) => ({
      ...prev,
      p1_first_name: prefillFromQuery.firstName || String(prev.p1_first_name || ''),
      p1_last_name: prefillFromQuery.lastName || String(prev.p1_last_name || ''),
      p1_dob: prefillFromQuery.dob || String(prev.p1_dob || ''),
      p1_mrn: prefillFromQuery.mrn || String(prev.p1_mrn || ''),
      p1_phone: prefillFromQuery.phone || String(prev.p1_phone || ''),
      p2_current_street: prefillFromQuery.address || String(prev.p2_current_street || ''),
      p2_current_city: prefillFromQuery.city || String(prev.p2_current_city || ''),
      p2_current_state: prefillFromQuery.state || String(prev.p2_current_state || ''),
      p2_current_zip: prefillFromQuery.zip || String(prev.p2_current_zip || ''),
    }));
  }, [prefillFromQuery.firstName, prefillFromQuery.lastName, prefillFromQuery.dob, prefillFromQuery.mrn, prefillFromQuery.address, prefillFromQuery.city, prefillFromQuery.state, prefillFromQuery.zip, prefillFromQuery.phone]);

  const uploaderParts = useMemo(() => {
    const cleaned = socialWorkerName.replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length <= 1) return { firstName: cleaned || 'Social', lastName: 'Worker' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }, [socialWorkerName]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSocialWorker) {
      toast({ title: 'Social worker access required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    if (!auth?.currentUser || !user?.uid) {
      toast({ title: 'Not signed in', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    const first = memberFirstName.trim();
    const last = memberLastName.trim();
    const memberName = `${first} ${last}`.replace(/\s+/g, ' ').trim();
    const upDate = uploadDate.trim();
    const mrn = kaiserMrn.trim();
    const swName = socialWorkerName.trim();
    if (!first || !last || !mrn || !swName || !upDate) {
      toast({
        title: 'Missing info',
        description: 'Member first/last name, Kaiser MRN, social worker name, and upload date are required.',
        variant: 'destructive',
      });
      return;
    }
    if (swName.includes('@')) {
      toast({
        title: 'Social worker name required',
        description: 'Please enter your real name (not an email address).',
        variant: 'destructive',
      });
      return;
    }
    if (isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeMember = sanitizePathSegment(memberName);
      const uploadRoot = `user_uploads/${user.uid}/sw-portal/alft/${safeMember}_${timestamp}`;

      const uploadPromises = Array.from(files || [])
        .slice(0, 5)
        .map((file, idx) => {
          const safeFile = sanitizePathSegment(file.name);
          const storagePath = `${uploadRoot}/${idx + 1}_${safeFile}`;
          const storageRef = ref(storage, storagePath);
          return new Promise<UploadedFile>((resolve, reject) => {
            const task = uploadBytesResumable(storageRef, file);
            task.on(
              'state_changed',
              (snap) => {
                const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
                setUploadProgress(Math.max(1, Math.min(99, Math.round(pct))));
              },
              (err) => reject(err),
              async () => {
                const downloadURL = await getDownloadURL(task.snapshot.ref);
                resolve({ fileName: file.name, downloadURL, storagePath: task.snapshot.ref.fullPath });
              }
            );
          });
        });

      const results = await Promise.all(uploadPromises);
      const idToken = await auth.currentUser.getIdToken();

      const res = await fetch('/api/alft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          uploader: { ...uploaderParts, email: swEmail, displayName: swName },
          uploadDate: upDate,
          member: { firstName: first, lastName: last, name: memberName, healthPlan: 'Kaiser', kaiserMrn: mrn, medicalRecordNumber: mrn },
          alftForm: {
            formVersion: 'placeholder-v1',
            stage: 'exact-1to1',
            headerInformation: {
              agencyName: agencyName.trim() || null,
              assessmentDate: upDate,
              planId: planId.trim() || null,
              assessorName: swName,
              assessorReferralDate: assessorReferralDate.trim() || null,
              assessmentPurpose,
              hasOtherResponder: hasOtherResponder === 'Yes',
              otherResponderName: otherResponderName.trim() || null,
              otherResponderRelationship: otherResponderRelationship.trim() || null,
            },
            demographics: {
              firstName: first,
              middleName: memberMiddleName.trim() || null,
              lastName: last,
              memberName,
              mrn,
              phoneNumber: memberPhone.trim() || null,
              dateOfBirth: memberDob.trim() || null,
              sex: memberSex.trim() || null,
              race: memberRace.trim() || null,
              ethnicity: memberEthnicity.trim() || null,
              primaryLanguage: memberPrimaryLanguage.trim() || null,
              limitedEnglish: limitedEnglish === 'Yes',
              maritalStatus: maritalStatus.trim() || null,
            },
            physicalLocation: {
              street: currentStreet.trim() || null,
              city: currentCity.trim() || null,
              state: currentState.trim() || null,
              zip: currentZip.trim() || null,
              locationType: currentLocationType,
              locationTypeOther: currentLocationType === 'Other' ? currentLocationOther.trim() || null : null,
              facilityName: facilityName.trim() || null,
            },
            homeAddress: {
              street: homeStreet.trim() || null,
              city: homeCity.trim() || null,
              state: homeState.trim() || null,
              zip: homeZip.trim() || null,
            },
            mailingAddress: {
              street: mailStreet.trim() || null,
              city: mailCity.trim() || null,
              state: mailState.trim() || null,
              zip: mailZip.trim() || null,
            },
            screening: {
              assessmentSite,
              apsRisk,
              imminentNursingRisk,
              onAlwpWaitlist,
              alwpAgency: alwpAgency.trim() || null,
              previousUnsuccessfulPlacements,
              previousPlacementExplanation: previousPlacementExplanation.trim() || null,
              hasPrimaryCaregiver,
              livingSituation: livingSituation.trim() || null,
              incomeSources: incomeSources.trim() || null,
            },
            clinicalAssessment: {
              cognitiveScreen: {
                orientation: cognitionOrientation.trim() || null,
                shortTermMemoryImpairment: shortTermMemoryImpairment === 'Yes',
                longTermMemoryImpairment: longTermMemoryImpairment === 'Yes',
                confusionEpisodes: confusionEpisodes === 'Yes',
                wanderingRisk: wanderingRisk === 'Yes',
                notes: cognitiveNotes.trim() || null,
              },
              generalHealth: {
                majorDiagnoses: majorDiagnoses.trim() || null,
                fallHistoryPast6Months: fallHistoryPast6Months === 'Yes',
                fallCountPast6Months: fallCountPast6Months.trim() || null,
                erVisitsPast6Months: erVisitsPast6Months.trim() || null,
                hospitalizationsPast6Months: hospitalizationsPast6Months.trim() || null,
                recentWeightLoss: recentWeightLoss === 'Yes',
                painConcerns: painConcerns === 'Yes',
                skinBreakdownRisk: skinBreakdownRisk === 'Yes',
                oxygenUse: oxygenUse === 'Yes',
                oxygenDetails: oxygenDetails.trim() || null,
                durableMedicalEquipment: durableMedicalEquipment.trim() || null,
              },
              adlIadl: {
                bathing: adlBathing,
                dressing: adlDressing,
                toileting: adlToileting,
                transferring: adlTransferring,
                ambulation: adlAmbulation,
                eating: adlEating,
                medicationManagement: iadlMedicationManagement,
                mealPreparation: iadlMealPrep,
                housekeeping: iadlHousekeeping,
                laundry: iadlLaundry,
                transportation: iadlTransportation,
                shopping: iadlShopping,
                finances: iadlFinances,
                phoneUse: iadlPhoneUse,
              },
            },
            stage3Assessment: {
              healthConditionsAndTherapies: healthConditionsAndTherapies.trim() || null,
              mentalHealthAndBehavior: {
                diagnosis: mentalHealthDiagnosis.trim() || null,
                depressionSymptoms,
                anxietySymptoms,
                agitationBehaviors,
                aggressionBehaviors,
                sleepDisturbance,
                interventions: behaviorInterventions.trim() || null,
              },
              nutritionMedsPhysicianDirectives: {
                nutritionNeeds: nutritionNeeds.trim() || null,
                medicationSummary: swMedicationSummary.trim() || null,
                primaryPhysicianName: primaryPhysicianName.trim() || null,
                primaryPhysicianPhone: primaryPhysicianPhone.trim() || null,
                advanceDirectiveInPlace: advanceDirectiveInPlace === 'Yes',
                advanceDirectiveNotes: advanceDirectiveNotes.trim() || null,
              },
              environmentSensoryLiving: {
                environmentalRisks: environmentalRisks.trim() || null,
                visionStatus: visionStatus.trim() || null,
                hearingStatus: hearingStatus.trim() || null,
                livingArrangementDetails: livingArrangementDetails.trim() || null,
              },
              medicationTable: medicationTable.trim() || null,
              rnMswCommentaryAndSignoff: {
                commentary: rnMswCommentary.trim() || null,
                rnReviewerName: rnReviewerName.trim() || null,
                rnReviewerDate: rnReviewerDate.trim() || null,
                mswSignatureName: mswSignatureName.trim() || null,
                mswSignatureDate: mswSignatureDate.trim() || null,
              },
            },
            exactPacketAnswers,
            facilityName: facilityName.trim(),
            priorityLevel: priorityLevel.trim() || 'Routine',
            transitionSummary: transitionSummary.trim(),
            barriersAndRisks: barriersAndRisks.trim(),
            requestedActions: requestedActions.trim(),
            additionalNotes: additionalNotes.trim(),
          },
          files: results.map((r) => ({ fileName: r.fileName, downloadURL: r.downloadURL, storagePath: r.storagePath })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Submit failed (HTTP ${res.status})`));
      }

      toast({
        title: 'ALFT uploaded',
        description: `Sent to intake. Email: ${data?.emailSent ? 'yes' : 'no'} • Electron: ${data?.electronNotified ? 'yes' : 'no'}`,
      });

      setFiles(null);
      setMemberFirstName('');
      setMemberLastName('');
      setUploadDate(todayLocalKey());
      setKaiserMrn('');
      setSocialWorkerName(swRealName);
      setFacilityName('');
      setPriorityLevel('Routine');
      setTransitionSummary('');
      setBarriersAndRisks('');
      setRequestedActions('');
      setAdditionalNotes('');
      setAgencyName('');
      setPlanId('');
      setAssessorReferralDate('');
      setAssessmentPurpose('Initial');
      setHasOtherResponder('No');
      setOtherResponderName('');
      setOtherResponderRelationship('');
      setMemberMiddleName('');
      setMemberPhone('');
      setMemberDob('');
      setMemberSex('');
      setMemberRace('');
      setMemberEthnicity('');
      setMemberPrimaryLanguage('');
      setLimitedEnglish('No');
      setMaritalStatus('');
      setCurrentStreet('');
      setCurrentCity('');
      setCurrentState('');
      setCurrentZip('');
      setCurrentLocationType('Private Residence');
      setCurrentLocationOther('');
      setHomeStreet('');
      setHomeCity('');
      setHomeState('');
      setHomeZip('');
      setMailStreet('');
      setMailCity('');
      setMailState('');
      setMailZip('');
      setAssessmentSite('Home');
      setApsRisk('Not Applicable');
      setImminentNursingRisk('No');
      setOnAlwpWaitlist('No');
      setAlwpAgency('');
      setPreviousUnsuccessfulPlacements('No');
      setPreviousPlacementExplanation('');
      setHasPrimaryCaregiver('No');
      setLivingSituation('');
      setIncomeSources('');
      setCognitionOrientation('');
      setShortTermMemoryImpairment('No');
      setLongTermMemoryImpairment('No');
      setConfusionEpisodes('No');
      setWanderingRisk('No');
      setCognitiveNotes('');
      setMajorDiagnoses('');
      setFallHistoryPast6Months('No');
      setFallCountPast6Months('');
      setErVisitsPast6Months('');
      setHospitalizationsPast6Months('');
      setRecentWeightLoss('No');
      setPainConcerns('No');
      setSkinBreakdownRisk('No');
      setOxygenUse('No');
      setOxygenDetails('');
      setDurableMedicalEquipment('');
      setAdlBathing('Needs Assistance');
      setAdlDressing('Needs Assistance');
      setAdlToileting('Needs Assistance');
      setAdlTransferring('Needs Assistance');
      setAdlAmbulation('Needs Assistance');
      setAdlEating('Needs Assistance');
      setIadlMedicationManagement('Needs Assistance');
      setIadlMealPrep('Needs Assistance');
      setIadlHousekeeping('Needs Assistance');
      setIadlLaundry('Needs Assistance');
      setIadlTransportation('Needs Assistance');
      setIadlShopping('Needs Assistance');
      setIadlFinances('Needs Assistance');
      setIadlPhoneUse('Needs Assistance');
      setHealthConditionsAndTherapies('');
      setMentalHealthDiagnosis('');
      setDepressionSymptoms('None');
      setAnxietySymptoms('None');
      setAgitationBehaviors('None');
      setAggressionBehaviors('None');
      setSleepDisturbance('None');
      setBehaviorInterventions('');
      setNutritionNeeds('');
      setSwMedicationSummary('');
      setPrimaryPhysicianName('');
      setPrimaryPhysicianPhone('');
      setAdvanceDirectiveInPlace('No');
      setAdvanceDirectiveNotes('');
      setEnvironmentalRisks('');
      setVisionStatus('');
      setHearingStatus('');
      setLivingArrangementDetails('');
      setMedicationTable('');
      setRnMswCommentary('');
      setRnReviewerName('');
      setRnReviewerDate('');
      setMswSignatureName('');
      setMswSignatureDate('');
      setExactPacketAnswers(createInitialExactAlftAnswers());
      setUploadProgress(0);
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Could not upload ALFT.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Social Worker Access Required</CardTitle>
          <CardDescription>Please sign in with your social worker account.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 alft-print-root">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5" />
            ALFT Internal Form + Upload (Kaiser)
          </CardTitle>
          <CardDescription>
            Placeholder internal ALFT form for easy edits. This creates an intake workflow item for staff/RN/sign-off without Adobe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Signed in as <span className="font-semibold">{swDisplayName}</span>
              {swEmail ? <span className="text-muted-foreground"> • {swEmail}</span> : null}
            </AlertDescription>
          </Alert>

          <form onSubmit={handleUpload} className="space-y-4 alft-print-form">
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-semibold">Stage 1: Header and demographics</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="agencyName">Agency</Label>
                  <Input id="agencyName" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planId">Plan ID</Label>
                  <Input id="planId" value={planId} onChange={(e) => setPlanId(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="assessorReferralDate">Assessor referral date</Label>
                  <Input
                    id="assessorReferralDate"
                    type="date"
                    value={assessorReferralDate}
                    onChange={(e) => setAssessorReferralDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assessmentPurpose">Assessment purpose</Label>
                  <select
                    id="assessmentPurpose"
                    value={assessmentPurpose}
                    onChange={(e) => setAssessmentPurpose(e.target.value as AssessmentPurpose)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="Initial">Initial</option>
                    <option value="Change of Condition">Change of Condition</option>
                    <option value="Review">Review</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hasOtherResponder">Other responder?</Label>
                  <select
                    id="hasOtherResponder"
                    value={hasOtherResponder}
                    onChange={(e) => setHasOtherResponder(e.target.value as YesNo)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Other responder name" value={otherResponderName} onChange={(e) => setOtherResponderName(e.target.value)} />
                <Input
                  placeholder="Other responder relationship"
                  value={otherResponderRelationship}
                  onChange={(e) => setOtherResponderRelationship(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Member name</Label>
                <a
                  className="text-xs underline underline-offset-2 text-blue-700"
                  href="https://www.carehomefinders.com/alft"
                  target="_blank"
                  rel="noreferrer"
                >
                  ALFT tool link
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  id="memberFirstName"
                  value={memberFirstName}
                  onChange={(e) => setMemberFirstName(e.target.value)}
                  placeholder="First name"
                  required
                />
                <Input
                  id="memberLastName"
                  value={memberLastName}
                  onChange={(e) => setMemberLastName(e.target.value)}
                  placeholder="Last name"
                  required
                />
              </div>
              <Input
                id="memberMiddleName"
                value={memberMiddleName}
                onChange={(e) => setMemberMiddleName(e.target.value)}
                placeholder="Middle name (optional)"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="mrn">Kaiser MRN</Label>
                <Input id="mrn" value={kaiserMrn} onChange={(e) => setKaiserMrn(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberPhone">Phone number</Label>
                <Input id="memberPhone" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="memberDob">Date of birth</Label>
                <Input id="memberDob" type="date" value={memberDob} onChange={(e) => setMemberDob(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberSex">Sex</Label>
                <Input id="memberSex" value={memberSex} onChange={(e) => setMemberSex(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input placeholder="Race" value={memberRace} onChange={(e) => setMemberRace(e.target.value)} />
              <Input placeholder="Ethnicity" value={memberEthnicity} onChange={(e) => setMemberEthnicity(e.target.value)} />
              <Input placeholder="Primary language" value={memberPrimaryLanguage} onChange={(e) => setMemberPrimaryLanguage(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="limitedEnglish">Limited English?</Label>
                <select
                  id="limitedEnglish"
                  value={limitedEnglish}
                  onChange={(e) => setLimitedEnglish(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maritalStatus">Marital status</Label>
                <Input id="maritalStatus" value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="facilityName">Facility / RCFE name (optional)</Label>
              <Input id="facilityName" value={facilityName} onChange={(e) => setFacilityName(e.target.value)} placeholder="Facility name" />
            </div>

            <div className="space-y-2">
              <Label>Current physical location</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Street" value={currentStreet} onChange={(e) => setCurrentStreet(e.target.value)} />
                <Input placeholder="City" value={currentCity} onChange={(e) => setCurrentCity(e.target.value)} />
                <Input placeholder="State" value={currentState} onChange={(e) => setCurrentState(e.target.value)} />
                <Input placeholder="ZIP" value={currentZip} onChange={(e) => setCurrentZip(e.target.value)} />
              </div>
              <select
                value={currentLocationType}
                onChange={(e) => setCurrentLocationType(e.target.value as LocationType)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="Private Residence">Private Residence</option>
                <option value="Assisted Living Facility (ALF)">Assisted Living Facility (ALF)</option>
                <option value="Nursing Facility">Nursing Facility</option>
                <option value="Hospital">Hospital</option>
                <option value="Adult Day Care">Adult Day Care</option>
                <option value="Other">Other</option>
              </select>
              {currentLocationType === 'Other' ? (
                <Input placeholder="Other location type" value={currentLocationOther} onChange={(e) => setCurrentLocationOther(e.target.value)} />
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Home address (if different)</Label>
                <Input placeholder="Street" value={homeStreet} onChange={(e) => setHomeStreet(e.target.value)} />
                <Input placeholder="City" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} />
                <Input placeholder="State" value={homeState} onChange={(e) => setHomeState(e.target.value)} />
                <Input placeholder="ZIP" value={homeZip} onChange={(e) => setHomeZip(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mailing address (if different)</Label>
                <Input placeholder="Street" value={mailStreet} onChange={(e) => setMailStreet(e.target.value)} />
                <Input placeholder="City" value={mailCity} onChange={(e) => setMailCity(e.target.value)} />
                <Input placeholder="State" value={mailState} onChange={(e) => setMailState(e.target.value)} />
                <Input placeholder="ZIP" value={mailZip} onChange={(e) => setMailZip(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={assessmentSite}
                onChange={(e) => setAssessmentSite(e.target.value as AssessmentSite)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="Home">Assessment site: Home</option>
                <option value="Nursing Facility">Assessment site: Nursing Facility</option>
                <option value="Hospital">Assessment site: Hospital</option>
                <option value="ALF">Assessment site: ALF</option>
                <option value="Adult Day Care">Assessment site: Adult Day Care</option>
                <option value="Other">Assessment site: Other</option>
              </select>
              <select
                value={apsRisk}
                onChange={(e) => setApsRisk(e.target.value as ApsRisk)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="High">APS risk: High</option>
                <option value="Intermediate">APS risk: Intermediate</option>
                <option value="Low">APS risk: Low</option>
                <option value="Not Applicable">APS risk: Not Applicable</option>
              </select>
              <select
                value={imminentNursingRisk}
                onChange={(e) => setImminentNursingRisk(e.target.value as YesNo)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="No">Imminent nursing risk: No</option>
                <option value="Yes">Imminent nursing risk: Yes</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={onAlwpWaitlist}
                onChange={(e) => setOnAlwpWaitlist(e.target.value as YesNo)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="No">ALWP waitlist: No</option>
                <option value="Yes">ALWP waitlist: Yes</option>
              </select>
              <Input placeholder="ALWP agency (if yes)" value={alwpAgency} onChange={(e) => setAlwpAgency(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={previousUnsuccessfulPlacements}
                onChange={(e) => setPreviousUnsuccessfulPlacements(e.target.value as YesNo)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="No">Previous unsuccessful placements: No</option>
                <option value="Yes">Previous unsuccessful placements: Yes</option>
              </select>
              <select
                value={hasPrimaryCaregiver}
                onChange={(e) => setHasPrimaryCaregiver(e.target.value as YesNo)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="No">Primary caregiver: No</option>
                <option value="Yes">Primary caregiver: Yes</option>
              </select>
            </div>

            <Input
              placeholder="Previous placement explanation (if yes)"
              value={previousPlacementExplanation}
              onChange={(e) => setPreviousPlacementExplanation(e.target.value)}
            />
            <Input placeholder="Living situation" value={livingSituation} onChange={(e) => setLivingSituation(e.target.value)} />

            <div className="space-y-2">
              <Label htmlFor="incomeSources">Income sources</Label>
              <textarea
                id="incomeSources"
                value={incomeSources}
                onChange={(e) => setIncomeSources(e.target.value)}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="SSI, SSDI, retirement, other amounts..."
              />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-semibold">Stage 2: Cognitive, health, and ADL/IADL</div>

              <div className="space-y-2">
                <Label htmlFor="cognitionOrientation">Orientation / cognition summary</Label>
                <Input
                  id="cognitionOrientation"
                  value={cognitionOrientation}
                  onChange={(e) => setCognitionOrientation(e.target.value)}
                  placeholder="Alert/oriented, intermittent confusion, etc."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={shortTermMemoryImpairment}
                  onChange={(e) => setShortTermMemoryImpairment(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Short-term memory impairment: No</option>
                  <option value="Yes">Short-term memory impairment: Yes</option>
                </select>
                <select
                  value={longTermMemoryImpairment}
                  onChange={(e) => setLongTermMemoryImpairment(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Long-term memory impairment: No</option>
                  <option value="Yes">Long-term memory impairment: Yes</option>
                </select>
                <select
                  value={confusionEpisodes}
                  onChange={(e) => setConfusionEpisodes(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Confusion episodes: No</option>
                  <option value="Yes">Confusion episodes: Yes</option>
                </select>
                <select
                  value={wanderingRisk}
                  onChange={(e) => setWanderingRisk(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Wandering risk: No</option>
                  <option value="Yes">Wandering risk: Yes</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cognitiveNotes">Cognitive notes</Label>
                <textarea
                  id="cognitiveNotes"
                  value={cognitiveNotes}
                  onChange={(e) => setCognitiveNotes(e.target.value)}
                  className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="majorDiagnoses">Major diagnoses and conditions</Label>
                <textarea
                  id="majorDiagnoses"
                  value={majorDiagnoses}
                  onChange={(e) => setMajorDiagnoses(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={fallHistoryPast6Months}
                  onChange={(e) => setFallHistoryPast6Months(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Falls in past 6 months: No</option>
                  <option value="Yes">Falls in past 6 months: Yes</option>
                </select>
                <Input
                  value={fallCountPast6Months}
                  onChange={(e) => setFallCountPast6Months(e.target.value)}
                  placeholder="Number of falls (if any)"
                />
                <Input
                  value={erVisitsPast6Months}
                  onChange={(e) => setErVisitsPast6Months(e.target.value)}
                  placeholder="ER visits in past 6 months"
                />
                <Input
                  value={hospitalizationsPast6Months}
                  onChange={(e) => setHospitalizationsPast6Months(e.target.value)}
                  placeholder="Hospitalizations in past 6 months"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={recentWeightLoss}
                  onChange={(e) => setRecentWeightLoss(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Recent weight loss: No</option>
                  <option value="Yes">Recent weight loss: Yes</option>
                </select>
                <select
                  value={painConcerns}
                  onChange={(e) => setPainConcerns(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Pain concerns: No</option>
                  <option value="Yes">Pain concerns: Yes</option>
                </select>
                <select
                  value={skinBreakdownRisk}
                  onChange={(e) => setSkinBreakdownRisk(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Skin breakdown risk: No</option>
                  <option value="Yes">Skin breakdown risk: Yes</option>
                </select>
                <select
                  value={oxygenUse}
                  onChange={(e) => setOxygenUse(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Oxygen use: No</option>
                  <option value="Yes">Oxygen use: Yes</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={oxygenDetails}
                  onChange={(e) => setOxygenDetails(e.target.value)}
                  placeholder="Oxygen details (liters/device), if any"
                />
                <Input
                  value={durableMedicalEquipment}
                  onChange={(e) => setDurableMedicalEquipment(e.target.value)}
                  placeholder="Durable medical equipment"
                />
              </div>

              <div className="text-xs font-medium text-muted-foreground">ADLs</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={adlBathing} onChange={(e) => setAdlBathing(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Bathing: Independent</option>
                  <option value="Needs Assistance">Bathing: Needs Assistance</option>
                  <option value="Dependent">Bathing: Dependent</option>
                  <option value="N/A">Bathing: N/A</option>
                </select>
                <select value={adlDressing} onChange={(e) => setAdlDressing(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Dressing: Independent</option>
                  <option value="Needs Assistance">Dressing: Needs Assistance</option>
                  <option value="Dependent">Dressing: Dependent</option>
                  <option value="N/A">Dressing: N/A</option>
                </select>
                <select value={adlToileting} onChange={(e) => setAdlToileting(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Toileting: Independent</option>
                  <option value="Needs Assistance">Toileting: Needs Assistance</option>
                  <option value="Dependent">Toileting: Dependent</option>
                  <option value="N/A">Toileting: N/A</option>
                </select>
                <select value={adlTransferring} onChange={(e) => setAdlTransferring(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Transferring: Independent</option>
                  <option value="Needs Assistance">Transferring: Needs Assistance</option>
                  <option value="Dependent">Transferring: Dependent</option>
                  <option value="N/A">Transferring: N/A</option>
                </select>
                <select value={adlAmbulation} onChange={(e) => setAdlAmbulation(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Ambulation: Independent</option>
                  <option value="Needs Assistance">Ambulation: Needs Assistance</option>
                  <option value="Dependent">Ambulation: Dependent</option>
                  <option value="N/A">Ambulation: N/A</option>
                </select>
                <select value={adlEating} onChange={(e) => setAdlEating(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Eating: Independent</option>
                  <option value="Needs Assistance">Eating: Needs Assistance</option>
                  <option value="Dependent">Eating: Dependent</option>
                  <option value="N/A">Eating: N/A</option>
                </select>
              </div>

              <div className="text-xs font-medium text-muted-foreground">IADLs</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={iadlMedicationManagement} onChange={(e) => setIadlMedicationManagement(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Medication management: Independent</option>
                  <option value="Needs Assistance">Medication management: Needs Assistance</option>
                  <option value="Dependent">Medication management: Dependent</option>
                  <option value="N/A">Medication management: N/A</option>
                </select>
                <select value={iadlMealPrep} onChange={(e) => setIadlMealPrep(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Meal prep: Independent</option>
                  <option value="Needs Assistance">Meal prep: Needs Assistance</option>
                  <option value="Dependent">Meal prep: Dependent</option>
                  <option value="N/A">Meal prep: N/A</option>
                </select>
                <select value={iadlHousekeeping} onChange={(e) => setIadlHousekeeping(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Housekeeping: Independent</option>
                  <option value="Needs Assistance">Housekeeping: Needs Assistance</option>
                  <option value="Dependent">Housekeeping: Dependent</option>
                  <option value="N/A">Housekeeping: N/A</option>
                </select>
                <select value={iadlLaundry} onChange={(e) => setIadlLaundry(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Laundry: Independent</option>
                  <option value="Needs Assistance">Laundry: Needs Assistance</option>
                  <option value="Dependent">Laundry: Dependent</option>
                  <option value="N/A">Laundry: N/A</option>
                </select>
                <select value={iadlTransportation} onChange={(e) => setIadlTransportation(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Transportation: Independent</option>
                  <option value="Needs Assistance">Transportation: Needs Assistance</option>
                  <option value="Dependent">Transportation: Dependent</option>
                  <option value="N/A">Transportation: N/A</option>
                </select>
                <select value={iadlShopping} onChange={(e) => setIadlShopping(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Shopping: Independent</option>
                  <option value="Needs Assistance">Shopping: Needs Assistance</option>
                  <option value="Dependent">Shopping: Dependent</option>
                  <option value="N/A">Shopping: N/A</option>
                </select>
                <select value={iadlFinances} onChange={(e) => setIadlFinances(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Finances: Independent</option>
                  <option value="Needs Assistance">Finances: Needs Assistance</option>
                  <option value="Dependent">Finances: Dependent</option>
                  <option value="N/A">Finances: N/A</option>
                </select>
                <select value={iadlPhoneUse} onChange={(e) => setIadlPhoneUse(e.target.value as FunctionLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Independent">Phone use: Independent</option>
                  <option value="Needs Assistance">Phone use: Needs Assistance</option>
                  <option value="Dependent">Phone use: Dependent</option>
                  <option value="N/A">Phone use: N/A</option>
                </select>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-semibold">Stage 3: Conditions, behavior, meds, environment, and sign-off prep</div>

              <div className="space-y-2">
                <Label htmlFor="healthConditionsAndTherapies">Health conditions and therapies</Label>
                <textarea
                  id="healthConditionsAndTherapies"
                  value={healthConditionsAndTherapies}
                  onChange={(e) => setHealthConditionsAndTherapies(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Chronic conditions, current therapies, treatment notes..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mentalHealthDiagnosis">Mental health diagnosis / notes</Label>
                <Input
                  id="mentalHealthDiagnosis"
                  value={mentalHealthDiagnosis}
                  onChange={(e) => setMentalHealthDiagnosis(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={depressionSymptoms} onChange={(e) => setDepressionSymptoms(e.target.value as BehaviorFrequency)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="None">Depression symptoms: None</option>
                  <option value="Rarely">Depression symptoms: Rarely</option>
                  <option value="Sometimes">Depression symptoms: Sometimes</option>
                  <option value="Often">Depression symptoms: Often</option>
                  <option value="Daily">Depression symptoms: Daily</option>
                </select>
                <select value={anxietySymptoms} onChange={(e) => setAnxietySymptoms(e.target.value as BehaviorFrequency)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="None">Anxiety symptoms: None</option>
                  <option value="Rarely">Anxiety symptoms: Rarely</option>
                  <option value="Sometimes">Anxiety symptoms: Sometimes</option>
                  <option value="Often">Anxiety symptoms: Often</option>
                  <option value="Daily">Anxiety symptoms: Daily</option>
                </select>
                <select value={agitationBehaviors} onChange={(e) => setAgitationBehaviors(e.target.value as BehaviorFrequency)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="None">Agitation behaviors: None</option>
                  <option value="Rarely">Agitation behaviors: Rarely</option>
                  <option value="Sometimes">Agitation behaviors: Sometimes</option>
                  <option value="Often">Agitation behaviors: Often</option>
                  <option value="Daily">Agitation behaviors: Daily</option>
                </select>
                <select value={aggressionBehaviors} onChange={(e) => setAggressionBehaviors(e.target.value as BehaviorFrequency)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="None">Aggression behaviors: None</option>
                  <option value="Rarely">Aggression behaviors: Rarely</option>
                  <option value="Sometimes">Aggression behaviors: Sometimes</option>
                  <option value="Often">Aggression behaviors: Often</option>
                  <option value="Daily">Aggression behaviors: Daily</option>
                </select>
                <select value={sleepDisturbance} onChange={(e) => setSleepDisturbance(e.target.value as BehaviorFrequency)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:col-span-2">
                  <option value="None">Sleep disturbance: None</option>
                  <option value="Rarely">Sleep disturbance: Rarely</option>
                  <option value="Sometimes">Sleep disturbance: Sometimes</option>
                  <option value="Often">Sleep disturbance: Often</option>
                  <option value="Daily">Sleep disturbance: Daily</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="behaviorInterventions">Behavior interventions / supports</Label>
                <textarea
                  id="behaviorInterventions"
                  value={behaviorInterventions}
                  onChange={(e) => setBehaviorInterventions(e.target.value)}
                  className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nutritionNeeds">Nutrition needs</Label>
                <textarea
                  id="nutritionNeeds"
                  value={nutritionNeeds}
                  onChange={(e) => setNutritionNeeds(e.target.value)}
                  className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="swMedicationSummary">Medication summary</Label>
                <textarea
                  id="swMedicationSummary"
                  value={swMedicationSummary}
                  onChange={(e) => setSwMedicationSummary(e.target.value)}
                  className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="List key meds/doses/frequency or paste concise med table notes..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Primary physician name" value={primaryPhysicianName} onChange={(e) => setPrimaryPhysicianName(e.target.value)} />
                <Input placeholder="Primary physician phone" value={primaryPhysicianPhone} onChange={(e) => setPrimaryPhysicianPhone(e.target.value)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={advanceDirectiveInPlace}
                  onChange={(e) => setAdvanceDirectiveInPlace(e.target.value as YesNo)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="No">Advance directive in place: No</option>
                  <option value="Yes">Advance directive in place: Yes</option>
                </select>
                <Input
                  placeholder="Advance directive notes"
                  value={advanceDirectiveNotes}
                  onChange={(e) => setAdvanceDirectiveNotes(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input placeholder="Environmental risks" value={environmentalRisks} onChange={(e) => setEnvironmentalRisks(e.target.value)} />
                <Input placeholder="Vision status" value={visionStatus} onChange={(e) => setVisionStatus(e.target.value)} />
                <Input placeholder="Hearing status" value={hearingStatus} onChange={(e) => setHearingStatus(e.target.value)} />
              </div>

              <Input
                placeholder="Living arrangement details"
                value={livingArrangementDetails}
                onChange={(e) => setLivingArrangementDetails(e.target.value)}
              />

              <div className="space-y-2">
                <Label htmlFor="medicationTable">Medication table (paste / structured text)</Label>
                <textarea
                  id="medicationTable"
                  value={medicationTable}
                  onChange={(e) => setMedicationTable(e.target.value)}
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Medication | Dose | Frequency | Route | Notes"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rnMswCommentary">RN/MSW commentary</Label>
                <textarea
                  id="rnMswCommentary"
                  value={rnMswCommentary}
                  onChange={(e) => setRnMswCommentary(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="RN reviewer name" value={rnReviewerName} onChange={(e) => setRnReviewerName(e.target.value)} />
                <Input type="date" value={rnReviewerDate} onChange={(e) => setRnReviewerDate(e.target.value)} />
                <Input placeholder="MSW signature name" value={mswSignatureName} onChange={(e) => setMswSignatureName(e.target.value)} />
                <Input type="date" value={mswSignatureDate} onChange={(e) => setMswSignatureDate(e.target.value)} />
              </div>
            </div>

            <ExactAlftQuestionnaire
              answers={exactPacketAnswers}
              onChange={(id, value) =>
                setExactPacketAnswers((prev) => ({
                  ...prev,
                  [id]: value,
                }))
              }
            />

            <div className="space-y-2">
              <Label htmlFor="swName">Social worker name</Label>
              <Input
                id="swName"
                value={socialWorkerName}
                onChange={(e) => setSocialWorkerName(e.target.value)}
                placeholder={swRealName ? '' : 'Type your full name (not email)'}
                required
                disabled={Boolean(swRealName)}
              />
              {!swRealName ? (
                <div className="text-xs text-muted-foreground">
                  This should auto-fill from your Social Worker profile. If it’s blank, ask admin to set your display name.
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="uploadDate">Upload date</Label>
              <Input
                id="uploadDate"
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priorityLevel">Priority</Label>
              <Input
                id="priorityLevel"
                value={priorityLevel}
                onChange={(e) => setPriorityLevel(e.target.value)}
                placeholder="Routine / Urgent / Priority"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transitionSummary">Transition summary</Label>
              <textarea
                id="transitionSummary"
                value={transitionSummary}
                onChange={(e) => setTransitionSummary(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Brief summary of current transition status and goals..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barriersAndRisks">Barriers / risks (optional)</Label>
              <textarea
                id="barriersAndRisks"
                value={barriersAndRisks}
                onChange={(e) => setBarriersAndRisks(e.target.value)}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Any barriers, concerns, or risks..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requestedActions">Requested actions</Label>
              <textarea
                id="requestedActions"
                value={requestedActions}
                onChange={(e) => setRequestedActions(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="What should staff/RN review or update?"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">Additional notes (optional)</Label>
              <textarea
                id="additionalNotes"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Anything else the team should know..."
              />
            </div>

            <div className="space-y-2 print:hidden">
              <Label htmlFor="file">Attachments (PDF/images/docs)</Label>
              <Input
                id="file"
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files)}
                disabled={isUploading}
              />
              <div className="text-xs text-muted-foreground">
                Attach source PDF or supporting files if available. Up to 5 files.
              </div>
            </div>

            {isUploading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading… {uploadProgress}%
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-2 print:hidden">
              <Button type="button" variant="outline" asChild className="sm:flex-1">
                <a href="/admin/alft-tracker/dummy-preview" target="_blank" rel="noreferrer">
                  View dummy PDF preview
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={handlePrint} className="sm:flex-1">
                Print / Save PDF
              </Button>
              <Button type="submit" disabled={isUploading} className="sm:flex-1">
                {isUploading ? 'Submitting…' : 'Submit ALFT form'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          .alft-print-root {
            max-width: none !important;
          }
          .alft-print-root .card,
          .alft-print-root [class*='rounded-md border'] {
            border: 1px solid #d4d4d8 !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .alft-print-root details > * {
            display: block !important;
          }
          .alft-print-root details > summary {
            list-style: none;
            margin-bottom: 0.35rem;
          }
          .alft-print-root input,
          .alft-print-root select,
          .alft-print-root textarea {
            border: 1px solid #d4d4d8 !important;
            color: #111827 !important;
            background: #ffffff !important;
          }
          .alft-print-root textarea {
            min-height: 72px !important;
          }
          .alft-print-root a {
            color: #111827 !important;
            text-decoration: none !important;
          }
        }
      `}</style>
    </div>
  );
}

