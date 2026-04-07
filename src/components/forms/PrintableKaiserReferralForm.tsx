'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';

type ReferralPrefill = {
  memberName?: string;
  memberDob?: string;
  memberPhone?: string;
  memberAddress?: string;
  memberMrn?: string;
  memberMediCal?: string;
  caregiverName?: string;
  caregiverContact?: string;
  referralDate?: string;
  referrerName?: string;
  referrerOrganization?: string;
  referrerNpi?: string;
  referrerAddress?: string;
  referrerEmail?: string;
  referrerPhone?: string;
  referrerRelationship?: string;
  currentLocationName?: string;
  currentLocationAddress?: string;
  healthPlan?: string;
  memberCounty?: string;
};

interface PrintableKaiserReferralFormProps extends ReferralPrefill {
  applicationId?: string;
  showPrintButton?: boolean;
}

const Checkbox = ({ checked, editable = true }: { checked?: boolean; editable?: boolean }) => {
  const [isChecked, setIsChecked] = React.useState(Boolean(checked));

  React.useEffect(() => {
    setIsChecked(Boolean(checked));
  }, [checked]);

  if (!editable) {
    return (
      <span
        aria-hidden
        className="inline-flex h-[13px] w-[13px] items-center justify-center border border-black align-middle text-[9px] leading-none"
      >
        {isChecked ? 'X' : ''}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsChecked((prev) => !prev)}
      aria-pressed={isChecked ? 'true' : 'false'}
      className="inline-flex h-[13px] w-[13px] items-center justify-center border border-black align-middle text-[9px] leading-none"
    >
      {isChecked ? 'X' : ''}
    </button>
  );
};

const InteractiveCheckbox = ({
  checked,
  onToggle,
  className = '',
}: {
  checked?: boolean;
  onToggle: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={`inline-flex h-[13px] w-[13px] items-center justify-center border border-black align-middle text-[9px] leading-none ${className}`}
    aria-pressed={checked ? 'true' : 'false'}
  >
    {checked ? 'X' : ''}
  </button>
);

const lineValue = (value?: string) => String(value || '').trim();
const DEFAULT_REFERRER_ORG = 'Connections Care Home Consultants, LLC';
const DEFAULT_REFERRER_NPI = '1508537325';
const DEFAULT_REFERRER_ADDRESS = '1763 East Sandalwood Drive, Palm Springs, CA 92262';
const KAISER_NORTH_INTAKE_EMAIL = 'REGMCDURNs-KPNC@KP.org';
const KAISER_SOUTH_INTAKE_EMAIL = 'RegCareCoordCaseMgmt@KP.org';

function normalizeCountyName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ county$/i, '')
    .replace(/[^a-z]/g, '');
}

function getKaiserRegionFromCounty(county: unknown): 'Kaiser North' | 'Kaiser South' | '' {
  const normalized = normalizeCountyName(county);
  if (!normalized) return '';

  const kaiserNorthCounties = new Set([
    'alameda', 'contracosta', 'marin', 'napa', 'sanfrancisco', 'sanmateo', 'santaclara', 'solano', 'sonoma',
    'sacramento', 'yolo', 'placer', 'eldorado', 'sutter', 'yuba', 'amador', 'nevada',
    'sanjoaquin', 'stanislaus', 'merced', 'madera', 'fresno', 'kings',
    'butte', 'shasta', 'tehama', 'glenn', 'colusa', 'humboldt', 'delnorte', 'siskiyou', 'trinity',
    'mendocino', 'lake', 'lassen', 'modoc', 'plumas',
  ]);

  return kaiserNorthCounties.has(normalized) ? 'Kaiser North' : 'Kaiser South';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to encode PDF.'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

function KaiserLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img src="/kaiser-permanente-logo-clean.png" alt="Kaiser Permanente" className="h-[50px] w-auto object-contain" />
    </span>
  );
}

function FieldLine({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  const [fieldValue, setFieldValue] = React.useState(lineValue(value));

  React.useEffect(() => {
    setFieldValue(lineValue(value));
  }, [value]);

  return (
    <div className={`leading-5 ${className}`}>
      <span className="font-semibold">{label}</span>{' '}
      <input
        value={fieldValue}
        onChange={(event) => setFieldValue(event.target.value)}
        className="inline-block min-w-[260px] border-b border-black bg-transparent px-1 align-baseline focus:outline-none"
      />
    </div>
  );
}

function EditableBox({
  initialValue = '',
  className = '',
  multiline = false,
}: {
  initialValue?: string;
  className?: string;
  multiline?: boolean;
}) {
  const [value, setValue] = React.useState(lineValue(initialValue));

  React.useEffect(() => {
    setValue(lineValue(initialValue));
  }, [initialValue]);

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={`w-full resize-none border border-transparent bg-transparent px-2 py-1 leading-5 focus:border-black focus:outline-none ${className}`}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className={`w-full border border-transparent bg-transparent px-2 py-1 leading-5 focus:border-black focus:outline-none ${className}`}
    />
  );
}

function PageShell({
  children,
  pageNumber,
  breakAfter = true,
}: {
  children: React.ReactNode;
  pageNumber: number;
  breakAfter?: boolean;
}) {
  return (
    <section
      className={`kaiser-packet-page flex flex-col bg-white px-5 py-4 ${
        breakAfter ? 'mb-6 break-after-page print:mb-0 print:break-after-page' : ''
      }`}
    >
      {children}
      <div className="mt-auto pt-6 flex items-center text-[11px] leading-4">
        <span>Updated October 2025</span>
        <span className="mx-auto">Page {pageNumber} of 15</span>
      </div>
    </section>
  );
}

function SectionBHeader({ itemLabel = '' }: { itemLabel?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <KaiserLogo />
      </div>
      <div className="text-[20px] font-bold leading-none">SECTION B: COMMUNITY SUPPORT SERVICES</div>
      <div className="mt-1 h-[6px] w-full bg-black" />
      {itemLabel ? <div className="mt-2 text-[18px] font-bold leading-none">{itemLabel}</div> : null}
    </div>
  );
}

export function PrintableKaiserReferralForm({
  applicationId,
  showPrintButton = true,
  ...prefill
}: PrintableKaiserReferralFormProps) {
  const packetRef = React.useRef<HTMLDivElement>(null);
  const [formValues, setFormValues] = React.useState(() => ({
    memberName: lineValue(prefill.memberName),
    memberDob: lineValue(prefill.memberDob),
    memberPhone: lineValue(prefill.memberPhone),
    memberAddress: lineValue(prefill.memberAddress),
    memberMrn: lineValue(prefill.memberMrn || prefill.memberMediCal),
    caregiverName: lineValue(prefill.caregiverName),
    caregiverContact: lineValue(prefill.caregiverContact),
    referralDate: lineValue(prefill.referralDate),
    referrerName: lineValue(prefill.referrerName),
    referrerOrganization: DEFAULT_REFERRER_ORG,
    referrerNpi: DEFAULT_REFERRER_NPI,
    referrerAddress: DEFAULT_REFERRER_ADDRESS,
    referrerEmail: lineValue(prefill.referrerEmail),
    referrerPhone: lineValue(prefill.referrerPhone),
    referrerRelationship: lineValue(prefill.referrerRelationship),
    currentLocationName: lineValue(prefill.currentLocationName),
    currentLocationAddress: lineValue(prefill.currentLocationAddress || prefill.memberAddress),
  }));
  const [serviceUsage, setServiceUsage] = React.useState({
    ecm: false,
    ccm: false,
    chw: false,
    cs: false,
    respite: false,
    alfTransitions: false,
    homeTransition: false,
    personalCare: false,
    envAdaptations: false,
    meals: false,
    sobering: false,
    asthma: false,
    housingNavigation: false,
    housingDeposits: false,
    housingTenancy: false,
    dayHabilitation: false,
    recuperativeCare: false,
    shortTermHousing: false,
  });
  const [currentLivingLocation, setCurrentLivingLocation] = React.useState<'A' | 'B' | 'C' | ''>('');
  const [isSendingToKaiser, setIsSendingToKaiser] = React.useState(false);
  const memberName = formValues.memberName;
  const referrerRelationship = lineValue(formValues.referrerRelationship).toLowerCase();
  const hasKaiserPlan = lineValue(prefill.healthPlan).toLowerCase().includes('kaiser');
  const referralDate = formValues.referralDate;
  const memberAddress = formValues.memberAddress;
  const currentLocationAddress = formValues.currentLocationAddress;
  const referrerName = formValues.referrerName;
  const referrerOrg = formValues.referrerOrganization;
  const referrerEmail = formValues.referrerEmail;
  const referrerPhone = formValues.referrerPhone;
  const referrerNpi = formValues.referrerNpi;
  const referrerAddress = formValues.referrerAddress;
  const memberCounty = lineValue(prefill.memberCounty);
  const kaiserRegion = getKaiserRegionFromCounty(memberCounty);
  const kaiserIntakeEmail = kaiserRegion === 'Kaiser North' ? KAISER_NORTH_INTAKE_EMAIL : KAISER_SOUTH_INTAKE_EMAIL;

  const handleSendToKaiserIntake = async () => {
    if (!packetRef.current) return;
    const defaultSubject = `CS Referral for Member Name: ${memberName || 'Member'} and MRN: ${formValues.memberMrn || 'N/A'}`;
    const customSubject = window.prompt('Email title (subject):', defaultSubject);
    if (customSubject == null) return;

    const defaultMessage = `Hello ${kaiserRegion || 'Kaiser South'} Intake,\n\nPlease find attached the reviewed Community Supports referral form.\n\nThank you.`;
    const customMessage = window.prompt('Email message:', defaultMessage);
    if (customMessage == null) return;

    if (!window.confirm(`Send this reviewed PDF to ${kaiserIntakeEmail} (${kaiserRegion || 'Kaiser South'})?`)) return;

    setIsSendingToKaiser(true);
    try {
      const mod: any = await import('html2pdf.js');
      const html2pdf = mod?.default ?? mod;
      if (typeof html2pdf !== 'function') throw new Error('PDF generator failed to load.');

      const options = {
        margin: [0.75, 0.5, 0.5, 0.5],
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          allowTaint: false,
          backgroundColor: '#ffffff'
        },
        jsPDF: {
          unit: 'in',
          format: 'letter',
          orientation: 'portrait'
        }
      };

      const worker = html2pdf().set(options).from(packetRef.current).toPdf();
      const pdfBlob = await worker.outputPdf('blob');
      const pdfBase64 = await blobToBase64(pdfBlob);

      const response = await fetch('/api/forms/kaiser-referral/send-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: kaiserIntakeEmail,
          region: kaiserRegion || 'Kaiser South',
          applicationId: String(applicationId || ''),
          memberName: memberName || 'Member',
          memberMrn: formValues.memberMrn || '',
          memberCounty: memberCounty || '',
          referrerName: referrerName || '',
          customSubject: customSubject.trim() || defaultSubject,
          customMessage: customMessage.trim() || defaultMessage,
          pdfBase64,
          fileName: `kaiser_referral_${(memberName || 'member').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.pdf`,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(String(result?.error || 'Failed to send email.'));
      }

      window.alert(`Sent to ${kaiserIntakeEmail} successfully.`);
    } catch (error: any) {
      window.alert(`Send failed: ${String(error?.message || error)}`);
    } finally {
      setIsSendingToKaiser(false);
    }
  };

  return (
    <PrintableFormLayout
      title="Kaiser Community Supports Member Referral Form"
      subtitle="Initial or Renewal Authorization Referral (Pre-Populated)"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
      hideDocumentChrome
      disableMonochrome
      extraControlsBelow={
        <div className="text-xs text-muted-foreground">
          Detected region: {kaiserRegion || 'Kaiser South'} ({kaiserIntakeEmail})
        </div>
      }
      extraControls={(
        <Button
          onClick={handleSendToKaiserIntake}
          variant="outline"
          className="flex-1 sm:flex-none"
          disabled={isSendingToKaiser}
        >
          {isSendingToKaiser ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending to Kaiser Intake...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send to {kaiserRegion === 'Kaiser North' ? 'Kaiser North' : 'Kaiser South'} Intake
            </>
          )}
        </Button>
      )}
    >
      <div ref={packetRef} className="kaiser-referral-packet space-y-0 font-['Arial'] text-[11px] leading-[1.35] print:text-[10.5px] print:leading-[1.3]">
        <PageShell pageNumber={1}>
          <div className="mb-2 flex items-center gap-2">
            <KaiserLogo />
          </div>
          <div className="bg-[#0b7db4] px-3 py-2 text-white">
            <div className="text-[20px] font-bold leading-none">Community Supports Member Referral Form</div>
            <div className="mt-1 text-[13px] font-bold leading-none">Keeping Members at Home and Chronic Conditions</div>
          </div>
          <div className="mt-3 space-y-2 text-[13px] leading-[1.2]">
            <p className="text-[13px] font-bold leading-none">General referral Information</p>
            <p>
              Kaiser Permanente ONLY accepts referrals for Medi-Cal Members whose coverage is assigned to Kaiser Permanente.
            </p>
            <p>
              Kaiser Permanente employs a "No Wrong Door" approach for Enhanced Care Management (ECM), Complex Case Management (CCM),
              Community Health Worker (CHW), and Community Supports (CS) referrals. Referrals should be submitted to the Member&apos;s
              Managed Care Plan (MCP) and will be accepted from all points of care within the continuum.
            </p>
            <p className="text-[13px] font-bold leading-none underline">What are Community Support services?</p>
            <p>
              CS services improve the health and well-being of MCP Members by addressing Members&apos; health-related social needs and
              helping them live healthier lives and avoid higher, costlier levels of care. They are non-medical services provided as
              cost-effective alternatives to traditional medical services and settings.
            </p>
            <p>
              Time-limited coverage of housing-related CS services are intended to help Members experiencing or at risk of homelessness
              address their health-related social needs, support their transition to housing stability, and realize significant
              improvements in health.
            </p>
            <p className="text-[13px] font-bold leading-none underline">Which Community Support services are included in this referral form?</p>
            <ul className="list-disc space-y-0.5 pl-6">
              <li>Respite Services (Caregiver Respite)</li>
              <li>Assisted Living Facility Transitions</li>
              <li>Community or Home Transition Services</li>
              <li>Personal Care and Homemaker Services</li>
              <li>Environmental Accessibility Adaptations (Home Modifications)</li>
              <li>Medically Tailored Meals/Medically-Supportive Food</li>
              <li>Asthma Remediation</li>
            </ul>
            <p className="text-[13px] font-bold leading-none">Instructions</p>
            <p>
              Complete all required fields to the best of your ability and submit this form via secure email to the appropriate region.
              Incomplete or outdated forms may cause processing delays.
            </p>
            <div className="mt-1 border border-black">
              <div className="grid grid-cols-[170px_1fr_1fr] text-[12px] leading-4">
                <div className="bg-[#0d2b78] text-white font-bold px-2 py-0.5 border-r border-black">&nbsp;</div>
                <div className="bg-[#0d2b78] text-white font-bold px-2 py-0.5 border-r border-black">Northern California</div>
                <div className="bg-[#0d2b78] text-white font-bold px-2 py-0.5">Southern California</div>
                <div className="bg-[#0d2b78] text-white font-bold px-2 py-0.5 border-r border-t border-black">Email Referrals</div>
                <div className="px-2 py-0.5 border-r border-t border-black text-[#0b58aa] underline">REGMCDURNs-KPNC@KP.org</div>
                <div className="px-2 py-0.5 border-t border-black text-[#0b58aa] underline">RegCareCoordCaseMgmt@KP.org</div>
                <div className="bg-[#0d2b78] text-white font-bold px-2 py-0.5 border-r border-t border-black">Provider Portal</div>
                <div className="px-2 py-0.5 border-r border-t border-black text-[#0b58aa] underline">NCAL - Provider Portal</div>
                <div className="px-2 py-0.5 border-t border-black text-[#0b58aa] underline">SCal Provider Portal</div>
              </div>
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={2}>
          <div className="mb-1 flex items-center gap-2">
            <KaiserLogo />
          </div>
          <div className="text-[20px] font-bold leading-none">SECTION A</div>
          <div className="mt-1 h-[6px] w-full bg-black" />
          <div className="mt-2 text-[12px]">Fields marked with an asterisk (*) are mandatory</div>

          <div className="mt-2 border-2 border-black bg-[#d9e8f7] p-2 text-[13px] leading-5">
            <div className="font-semibold">Is the person being referred a Kaiser Permanente (KP) Medi-Cal Member?*</div>
            <div><Checkbox checked={hasKaiserPlan} /> Yes, this is a Kaiser Permanente Medi-Cal Member</div>
            <div><Checkbox checked={!hasKaiserPlan} /> No, STOP, do NOT proceed. Please send referral to their assigned Medi-Cal Managed Care Plan</div>
          </div>

          <div className="mt-2 text-[18px] font-bold leading-none">Referral Source Information</div>
          <div className="mt-1 border-2 border-black text-[13px]">
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold">Date of Referral*</div>
                <div className="mt-1 min-h-[22px]">
                  <input
                    value={formValues.referralDate}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, referralDate: event.target.value }))}
                    className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
              <div className="p-1.5">
                <div className="font-semibold">Referrer Name*</div>
                <div className="mt-1 min-h-[22px]">
                  <input
                    value={formValues.referrerName}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, referrerName: event.target.value }))}
                    className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referring Organization Name*</div>
              <div className="mt-1 min-h-[22px]">
                <input
                  value={formValues.referrerOrganization}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, referrerOrganization: event.target.value }))}
                  className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referring Organization National Provider Identifier (NPI)*</div>
              <div className="mt-1 min-h-[22px]">
                <input
                  value={formValues.referrerNpi}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, referrerNpi: event.target.value }))}
                  className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referrer/Referring Organization Address* (Street, City, State, Zip Code)</div>
              <div className="mt-1 min-h-[22px]">
                <input
                  value={formValues.referrerAddress}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, referrerAddress: event.target.value }))}
                  className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold">Referrer Email*</div>
                <div className="mt-1 min-h-[22px]">
                  <input
                    value={formValues.referrerEmail}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, referrerEmail: event.target.value }))}
                    className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
              <div className="p-1.5">
                <div className="font-semibold">Referrer Phone Number*</div>
                <div className="mt-1 min-h-[22px]">
                  <input
                    value={formValues.referrerPhone}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, referrerPhone: event.target.value }))}
                    className="w-full border border-transparent bg-transparent px-1 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referrer Relationship to Member? Select the ONE that applies*:</div>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                <span><Checkbox checked={referrerRelationship.includes('medical')} /> Medical provider</span>
                <span><Checkbox checked={referrerRelationship.includes('social')} /> Social services provider</span>
                <span><Checkbox checked={referrerRelationship.includes('family') || referrerRelationship.includes('member')} /> Member/family</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span><Checkbox checked={!referrerRelationship || referrerRelationship.includes('community')} /> Other please specify:</span>
                <span className="inline-block min-w-[360px] border border-black px-1">
                  <EditableBox initialValue="Community Support (CalAim)" />
                </span>
              </div>
            </div>
            <div className="p-1.5">
              <div className="font-semibold">External referral by? Select the ONE that applies*:</div>
              <div className="mt-1 space-y-0.5">
                <div><Checkbox checked={false} /> Network Lead Entity (NLE)</div>
                <div><Checkbox checked={false} /> ECM, CHW or CS vendor - select the one you are affiliated with:</div>
                <div className="ml-4 flex flex-wrap gap-x-5 gap-y-0.5">
                  <span><Checkbox checked={false} /> Full Circle Health</span>
                  <span><Checkbox checked={false} /> Independent Living Systems</span>
                  <span><Checkbox checked={false} /> Mom&apos;s Meals</span>
                  <span><Checkbox checked={false} /> Partners in Care</span>
                </div>
                <div><Checkbox checked={false} /> Managed Care Plan (MCP)</div>
                <div><Checkbox checked={false} /> Other health care provider</div>
                <div><Checkbox checked={false} /> Mental health care provider</div>
                <div><Checkbox checked={false} /> Hospital or Emergency Room care team</div>
                <div><Checkbox checked={false} /> County or other government organization</div>
                <div><Checkbox checked={false} /> Schools/Local Education Agencies (LEAs)</div>
                <div><Checkbox checked /> Other community-based provider</div>
                <div><Checkbox checked={false} /> Legal aid organizations</div>
                <div><Checkbox checked={false} /> Justice involved organizations</div>
                <div className="mt-1 flex items-center gap-2">
                  <span><Checkbox checked={false} /> Other, please specify:</span>
                  <span className="inline-block min-w-[340px] border border-black px-1">
                    <EditableBox />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={3}>
          <div className="mb-1 flex items-center gap-2">
            <KaiserLogo />
          </div>
          <div className="text-[20px] font-bold leading-none">SECTION A</div>
          <div className="mt-1 h-[6px] w-full bg-black" />
          <div className="mt-2 text-[12px]">Fields marked with an asterisk (*) are mandatory</div>

          <div className="mt-2 text-[18px] font-bold leading-none">Member Information</div>
          <div className="mt-1 border-2 border-black text-[13px]">
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Member Name (First Name, Middle Initial, Last Name)*</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">
                <input
                  value={formValues.memberName}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, memberName: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold">Member Date of Birth*</div>
                <div className="mt-1 min-h-[28px] border border-black px-1">
                  <input
                    value={formValues.memberDob}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, memberDob: event.target.value }))}
                    className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                  />
                </div>
              </div>
              <div className="p-1.5">
                <div className="font-semibold">Member Phone Number*</div>
                <div className="mt-1 min-h-[28px] border border-black px-1">
                  <input
                    value={formValues.memberPhone}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, memberPhone: event.target.value }))}
                    className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Member Mailing Address* (Street, City, State, Zip Code)</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">
                <input
                  value={formValues.memberAddress}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, memberAddress: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Member&apos;s Kaiser Permanente MRN* (or Medi-Cal CIN if MRN is unknown)</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">
                <input
                  value={formValues.memberMrn}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, memberMrn: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Caregiver/Support Person Name</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">
                <input
                  value={formValues.caregiverName}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, caregiverName: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="p-1.5">
              <div className="font-semibold">Caregiver/Support Person Contact (Email/Phone Number)</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">
                <input
                  value={formValues.caregiverContact}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, caregiverContact: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-2 text-[18px] font-bold leading-none">Current Service Usage</div>
          <div className="mt-1 border-2 border-black p-1.5 text-[13px]">
            <div className="font-semibold">1.) Is the Member currently receiving any of the following services? Select ALL that apply:</div>
            <div className="mt-1"><InteractiveCheckbox checked={serviceUsage.ecm} onToggle={() => setServiceUsage((prev) => ({ ...prev, ecm: !prev.ecm }))} className="mr-1" />A.) ECM - If selected, please include the following information:</div>
            <div className="ml-8 mt-0.5 flex items-center gap-2">
              <span className="font-semibold">Provider Name:</span>
              <span className="inline-block min-w-[340px] border border-black px-1">
                <EditableBox />
              </span>
            </div>
            <div className="ml-8 mt-0.5 flex items-center gap-2">
              <span className="font-semibold">Email or Phone Number:</span>
              <span className="inline-block min-w-[305px] border border-black px-1">
                <EditableBox />
              </span>
            </div>
            <div className="mt-1"><InteractiveCheckbox checked={serviceUsage.ccm} onToggle={() => setServiceUsage((prev) => ({ ...prev, ccm: !prev.ccm }))} className="mr-1" />B.) CCM</div>
            <div><InteractiveCheckbox checked={serviceUsage.chw} onToggle={() => setServiceUsage((prev) => ({ ...prev, chw: !prev.chw }))} className="mr-1" />C.) CHW</div>
            <div><InteractiveCheckbox checked={serviceUsage.cs} onToggle={() => setServiceUsage((prev) => ({ ...prev, cs: !prev.cs }))} className="mr-1" />D.) CS Services</div>
            <div className="mt-0.5 grid grid-cols-2 gap-x-2">
              <div className="space-y-0.5">
                <div><InteractiveCheckbox checked={serviceUsage.respite} onToggle={() => setServiceUsage((prev) => ({ ...prev, respite: !prev.respite }))} className="mr-1" />Respite Services (Caregiver Respite)</div>
                <div><InteractiveCheckbox checked={serviceUsage.alfTransitions} onToggle={() => setServiceUsage((prev) => ({ ...prev, alfTransitions: !prev.alfTransitions }))} className="mr-1" />Assisted Living Facility Transitions</div>
                <div><InteractiveCheckbox checked={serviceUsage.homeTransition} onToggle={() => setServiceUsage((prev) => ({ ...prev, homeTransition: !prev.homeTransition }))} className="mr-1" />Community or Home Transition Services</div>
                <div><InteractiveCheckbox checked={serviceUsage.personalCare} onToggle={() => setServiceUsage((prev) => ({ ...prev, personalCare: !prev.personalCare }))} className="mr-1" />Personal Care and Homemaker Services</div>
                <div><InteractiveCheckbox checked={serviceUsage.envAdaptations} onToggle={() => setServiceUsage((prev) => ({ ...prev, envAdaptations: !prev.envAdaptations }))} className="mr-1" />Environmental Accessibility Adaptations (Home Modifications)</div>
                <div><InteractiveCheckbox checked={serviceUsage.meals} onToggle={() => setServiceUsage((prev) => ({ ...prev, meals: !prev.meals }))} className="mr-1" />Medically Tailored Meals/Medically-Supportive Food</div>
                <div><InteractiveCheckbox checked={serviceUsage.sobering} onToggle={() => setServiceUsage((prev) => ({ ...prev, sobering: !prev.sobering }))} className="mr-1" />Sobering Centers</div>
              </div>
              <div className="space-y-0.5">
                <div><InteractiveCheckbox checked={serviceUsage.asthma} onToggle={() => setServiceUsage((prev) => ({ ...prev, asthma: !prev.asthma }))} className="mr-1" />Asthma Remediation</div>
                <div><InteractiveCheckbox checked={serviceUsage.housingNavigation} onToggle={() => setServiceUsage((prev) => ({ ...prev, housingNavigation: !prev.housingNavigation }))} className="mr-1" />Housing Transition Navigation Services</div>
                <div><InteractiveCheckbox checked={serviceUsage.housingDeposits} onToggle={() => setServiceUsage((prev) => ({ ...prev, housingDeposits: !prev.housingDeposits }))} className="mr-1" />Housing Deposits</div>
                <div><InteractiveCheckbox checked={serviceUsage.housingTenancy} onToggle={() => setServiceUsage((prev) => ({ ...prev, housingTenancy: !prev.housingTenancy }))} className="mr-1" />Housing Tenancy and Sustaining Services</div>
                <div><InteractiveCheckbox checked={serviceUsage.dayHabilitation} onToggle={() => setServiceUsage((prev) => ({ ...prev, dayHabilitation: !prev.dayHabilitation }))} className="mr-1" />Day Habilitation Programs</div>
                <div><InteractiveCheckbox checked={serviceUsage.recuperativeCare} onToggle={() => setServiceUsage((prev) => ({ ...prev, recuperativeCare: !prev.recuperativeCare }))} className="mr-1" />Recuperative Care (Medical Respite)</div>
                <div><InteractiveCheckbox checked={serviceUsage.shortTermHousing} onToggle={() => setServiceUsage((prev) => ({ ...prev, shortTermHousing: !prev.shortTermHousing }))} className="mr-1" />Short-Term Post-Hospitalization Housing</div>
              </div>
            </div>
          </div>

          <div className="mt-2 text-[18px] font-bold leading-none">Attestation*</div>
          <div className="mt-1 border-2 border-black bg-[#d9e8f7] p-1.5 text-[13px] leading-5">
            <div><Checkbox checked /> By checking this box, you confirm that all information provided on this form is accurate and has been verified.</div>
            <div>You also confirm that the Member has consented to participating in the program(s) they are being referred to</div>
            <div>AND that you can provide supporting documentation if requested.</div>
          </div>
        </PageShell>

        <PageShell pageNumber={4}>
          <div className="mb-1 flex items-center gap-2">
            <KaiserLogo />
          </div>
          <div className="text-[20px] font-bold leading-none">SECTION B: COMMUNITY SUPPORT SERVICES</div>
          <div className="mt-1 h-[6px] w-full bg-black" />
          <div className="mt-2 text-[18px] font-bold leading-none"><Checkbox checked={false} /> 1. Respite Services (Caregiver Respite)</div>
          <div className="mt-1 border-y border-black p-1.5 text-[13px]">
            <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
            <div><span className="font-semibold">Description:</span> Provides short-term relief for caregivers of Members who are at home or in an approved facility.</div>
            <div className="mt-1 font-semibold">Key Information:</div>
            <ul className="ml-6 list-disc">
              <li>Service limit is up to 336 hours per calendar year, unless an exception is made.</li>
              <li>Hours beyond the 336-hour calendar year limit may be approved when caregiver support changes.</li>
            </ul>
          </div>
          <div className="mt-2 text-[13px]">
            <div className="font-bold">1.1) THE MEMBER MUST MEET ONE OF THE FOLLOWING CRITERIA.</div>
            <div className="ml-4">-> Select the <span className="underline">one</span> that applies:</div>
            <div className="mt-1"><Checkbox checked={false} /> A) Lives in the community and is compromised with ADLs and dependent on caregiver support to avoid institutional placement;</div>
            <div className="mt-1 text-center font-bold">OR</div>
            <div><Checkbox checked={false} /> B) Other subsets include children who belong to any of the following categories:</div>
            <div className="ml-8 mt-1 space-y-0.5">
              <div><Checkbox checked={false} /> Previously covered for Respite Services under the Pediatrics Palliative Care Waiver</div>
              <div><Checkbox checked={false} /> Foster care program beneficiaries</div>
              <div><Checkbox checked={false} /> Members enrolled in either California Children&apos;s Services</div>
              <div><Checkbox checked={false} /> Genetically Handicapped Persons Program</div>
              <div><Checkbox checked={false} /> Members with Complex Care Needs</div>
              <div><Checkbox checked={false} /> Members live in a location where services can be provided</div>
            </div>
            <div className="mt-2 font-semibold">COMMENTS (optional)</div>
            <div className="mt-1 min-h-[105px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[98px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={5}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked /> 2. Assisted Living Facility Transitions (Page 1 of 2)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-1 border-y border-black bg-[#ececec] p-2">
              <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
              <div className="mt-1">
                <span className="font-semibold">Description:</span> Assisting Members who are residing at home or in a nursing facility,
                that need nursing facility level of care with transitioning to an assisted living facility (ALF) to avoid institutionalization.
              </div>
              <div className="mt-2">
                <span className="font-semibold">Name Change:</span> As of April 2025 (DHCS Policy Guide), this service is now called ALF
                Transitions (previously &quot;Nursing Facility Transition/Diversion to Assisted Living Facilities&quot;).
              </div>
              <div className="mt-2 font-semibold">Key Information:</div>
              <ul className="ml-6 list-disc space-y-1">
                <li>
                  <span className="font-semibold underline">Before</span> submitting a referral:
                  <ul className="ml-6 list-[circle]">
                    <li>Consider other care options first, such as: ECM, Community-Based Adult Services, In-Home Supportive Services, Personal Care and Homemaker Services, Caregiver Respite, etc.</li>
                    <li>If the Member lives in an Assisted Living Waiver (ALW) county, prioritize placement in an ALW-participating ALF.</li>
                  </ul>
                </li>
                <li>
                  This Community Support service includes two components:
                  <ul className="ml-6 list-[circle]">
                    <li><span className="font-semibold">Time-Limited transition services and expenses</span> - Assesses and supports the Member in moving into and establishing residency in an ALF</li>
                    <li><span className="font-semibold">Ongoing ALF services</span> - Provides continued support for the Member in maintaining nursing facility level of care needs at the ALF</li>
                  </ul>
                </li>
                <li>Members may be eligible if receiving facility level health care services on an acute or post-acute care basis.</li>
                <li>An in-person assessment is required to determine eligibility and confirm clinical status.</li>
                <li><span className="font-semibold">Members must be authorized for Time-Limited transition services and expenses before</span> initiating Ongoing ALF services.</li>
                <li><span className="font-semibold">Members are responsible for paying for room and board at the facility.</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-3 text-[13px]">
            <div className="font-bold">2.1) WHICH SERVICE IS THE MEMBER BEING REFERRED FOR?</div>
            <div className="ml-4">-> Select the <span className="underline">one</span> that applies:</div>
            <div className="mt-1"><Checkbox checked /> A) Time-Limited transition services and expenses</div>
            <div><Checkbox checked={false} /> B) Ongoing ALF services (<span className="font-semibold">Note:</span> Member MUST first be approved for Time-Limited transition services and expenses <span className="underline">before</span> starting Ongoing ALF services)</div>
          </div>
        </PageShell>

        <PageShell pageNumber={6}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked /> 2. Assisted Living Facility Transitions (Page 2 of 2)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="font-semibold">2.2) WHERE IS THE MEMBER CURRENTLY LIVING?</div>
            <div className="ml-4">-> Select the one that applies:</div>
            <div className="mt-2 space-y-2">
              <div><InteractiveCheckbox checked={currentLivingLocation === 'A'} onToggle={() => setCurrentLivingLocation((prev) => (prev === 'A' ? '' : 'A'))} className="mr-1" />A) Skilled Nursing Facility (SNF)</div>
              <div className="ml-8">-> To be eligible, Member must meet <span className="underline">all</span> of the following criteria:</div>
              <div className="ml-12">- Has lived in a nursing facility for 60 days or more; <span className="font-semibold">AND</span></div>
              <div className="ml-12">- Is willing to live in an ALF setting instead of nursing facility; <span className="font-semibold">AND</span></div>
              <div className="ml-12">- Is able to reside safely in an ALF</div>
              <div className="text-center font-semibold">OR</div>
              <div><InteractiveCheckbox checked={currentLivingLocation === 'B'} onToggle={() => setCurrentLivingLocation((prev) => (prev === 'B' ? '' : 'B'))} className="mr-1" />B) At home or in public subsidized housing</div>
              <div className="ml-8">-> To be eligible, Member must meet <span className="underline">all</span> of the following criteria:</div>
              <div className="ml-12">- Is interested in remaining in the community; <span className="font-semibold">AND</span></div>
              <div className="ml-12">- Is willing and able to reside safely in an ALF; <span className="font-semibold">AND</span></div>
              <div className="ml-12">- Meets nursing facility level of care (LOC) criteria and chooses to stay in the community and continue to receive medically necessary LOC services in an ALF</div>
              <div className="text-center font-semibold">OR</div>
              <div><InteractiveCheckbox checked={currentLivingLocation === 'C'} onToggle={() => setCurrentLivingLocation((prev) => (prev === 'C' ? '' : 'C'))} className="mr-1" />C) In an Assisted Living Facility (ALF) or a Board and Care Facility</div>
              <div className="ml-8">-> To be eligible, the Member must meet <span className="underline">all</span> of the following criteria:</div>
              <div className="ml-12">- Is interested in remaining in the community; <span className="font-semibold">AND</span></div>
              <div className="ml-12">- Is willing and able to reside safely in an ALF; <span className="font-semibold">AND</span></div>
              <div className="ml-12">- Meets nursing facility level of care (LOC) criteria and chooses to stay in the community and continue to receive medically necessary LOC services in an ALF</div>
              <div className="ml-8">-> If selected, please provide the following information on the ALF/Board and Care:</div>
            </div>
            <div className="mt-2 space-y-1">
              <div className="font-semibold">Facility Name:</div>
              <div className="min-h-[44px] border-2 border-black bg-[#d9e8f7] px-2 py-1">
                <input
                  value={formValues.currentLocationName}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, currentLocationName: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
              <div className="font-semibold">Address (Street, City, State, Zip Code):</div>
              <div className="min-h-[44px] border-2 border-black bg-[#d9e8f7] px-2 py-1">
                <input
                  value={formValues.currentLocationAddress}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, currentLocationAddress: event.target.value }))}
                  className="h-[24px] w-full border border-transparent bg-transparent focus:border-black focus:outline-none"
                />
              </div>
              <div className="font-semibold">Current cost and how it&apos;s being covered?</div>
              <div className="min-h-[44px] border-2 border-black bg-[#d9e8f7]">
                <EditableBox className="h-[36px]" />
              </div>
            </div>
            <div className="mt-3 font-semibold">COMMENTS <span className="font-normal">(optional)</span></div>
            <div className="mt-1 min-h-[120px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[112px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={7}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 3. Community or Home Transition Services</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-1 border-y border-black bg-[#ececec] p-2">
              <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
              <div className="mt-1"><span className="font-semibold">Description:</span> Help with non-recurring costs to move from licensed facility to private residence.</div>
              <div className="mt-2"><span className="font-semibold">Name Change:</span> As of April 2025 (DHCS Policy Guide), this service is now called Community or Home Transition Services (previously, &quot;Community Transition Services/Nursing Facility Transition to a Home&quot;).</div>
            </div>
            <div className="mt-3 font-bold">3.1) TO BE ELIGIBLE, THE MEMBER MUST MEET <span className="underline">ALL</span> OF THE FOLLOWING CRITERIA:</div>
            <div className="ml-4">-> Select <span className="underline">all</span> that apply:</div>
            <div className="mt-1 ml-4"><Checkbox checked={false} /> Member is receiving medically necessary nursing facility Level of care (LOC) services and in lieu of remaining in the nursing facility or Recuperative Care setting are choosing to transition home and continue to receive medically necessary nursing facility LOC services;</div>
            <div className="text-center font-semibold">AND</div>
            <div className="ml-4"><Checkbox checked={false} /> Member has lived 60+ days in a nursing home and/or Recuperative Care setting;</div>
            <div className="text-center font-semibold">AND</div>
            <div className="ml-4"><Checkbox checked={false} /> Member is interested in moving back to the community;</div>
            <div className="text-center font-semibold">AND</div>
            <div className="ml-4"><Checkbox checked={false} /> Member is able to reside safely in the community with appropriate and cost-effective supports and services</div>
            <div className="mt-4 font-semibold">COMMENTS <span className="font-normal">(optional)</span></div>
            <div className="mt-1 min-h-[120px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[112px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={8}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 4. Personal Care and Homemaker Services (Page 1 of 2)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-1 border-y border-black bg-[#ececec] p-2">
              <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
              <div><span className="font-semibold">Description:</span> Provides in-home support with activities of daily living (ADLs) or instrumental activities of daily living (IADLs).</div>
              <div className="mt-2 font-semibold">Key Information:</div>
              <ul className="ml-6 list-disc">
                <li>If the Member meets the IHSS referral criteria, they must be referred to IHSS. Personal Care and Homemaker Services (PCHS) cannot be utilized as a substitute for IHSS.</li>
                <li>If the Member is currently receiving PCHS and conditions change, they must be referred to IHSS for reassessment. The Member may continue receiving PCHS while waiting for the IHSS reassessment decision.</li>
                <li>If the Member needs help applying for IHSS, submit a referral to ECM, CCM, or CHW for support.</li>
                <li>Members enrolled in HCBA program or receiving/eligible for Waiver Personal Care services are not eligible for PCHS.</li>
              </ul>
            </div>
            <div className="mt-3 font-bold">4.1) TO BE ELIGIBLE, THE MEMBER MUST MEET <span className="underline">ONE</span> OF THE FOLLOWING CRITERIA.</div>
            <div className="ml-4">-> Select the one that applies:</div>
            <div className="ml-4"><Checkbox checked={false} /> A) Member is at risk of hospitalization or institutionalization in a nursing facility; <span className="font-semibold">OR</span></div>
            <div className="ml-4 mt-2"><Checkbox checked={false} /> B) Member has functional deficits and no other adequate support system; <span className="font-semibold">OR</span></div>
            <div className="ml-4 mt-2"><Checkbox checked={false} /> C) Member approved for IHSS</div>
          </div>
        </PageShell>

        <PageShell pageNumber={9}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 4. Personal Care and Homemaker Services (Page 2 of 2)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-2 font-bold">4.2) WHAT IS THE MEMBER&apos;S IHSS APPLICATION STATUS?</div>
            <div className="ml-4">-> Select the one that applies:</div>
            <div className="ml-6 mt-1"><Checkbox checked={false} /> A) Member has applied for IHSS and is waiting for a decision;</div>
            <div className="ml-10">-> If selected, please provide the following information.</div>
            <div className="ml-10 mt-1 grid grid-cols-[220px_1fr] items-center gap-2">
              <div className="text-right font-semibold">IHSS application date:</div>
              <div className="min-h-[34px] border-2 border-black bg-[#d9e8f7]">
                <EditableBox className="h-[28px]" />
              </div>
            </div>
            <div className="my-1 text-center font-semibold">OR</div>
            <div className="ml-6"><Checkbox checked={false} /> B) Member is currently receiving IHSS, needs additional IHSS hours, reassessment request pending.</div>
            <div className="ml-10">-> If selected, please provide the following information.</div>
            <div className="ml-10 mt-1 grid grid-cols-[220px_1fr] items-center gap-2">
              <div className="text-right font-semibold">IHSS reassessment application date:</div>
              <div className="min-h-[34px] border-2 border-black bg-[#d9e8f7]">
                <EditableBox className="h-[28px]" />
              </div>
              <div className="text-right font-semibold">Current approved IHSS hours per month:</div>
              <div className="min-h-[34px] border-2 border-black bg-[#d9e8f7]">
                <EditableBox className="h-[28px]" />
              </div>
            </div>
            <div className="my-1 text-center font-semibold">OR</div>
            <div className="ml-6"><Checkbox checked={false} /> C) Member has been approved for the maximum IHSS hours, but needs additional support.</div>
            <div className="ml-10">-> If selected, please explain why additional support is needed.</div>
            <div className="ml-10 mt-1 min-h-[34px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox className="h-[28px]" />
            </div>
            <div className="my-1 text-center font-semibold">OR</div>
            <div className="ml-6"><Checkbox checked={false} /> D) Member is <span className="font-semibold">not</span> eligible for IHSS and needs services to help avoid a short-term stay in a skilled nursing facility.</div>
            <div className="ml-10">-> If selected, please explain the Member&apos;s clinical status and why these services are needed.</div>
            <div className="ml-10 mt-1 min-h-[34px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox className="h-[28px]" />
            </div>
            <div className="my-1 text-center font-semibold">OR</div>
            <div className="ml-6"><Checkbox checked={false} /> E) Member is not eligible for IHSS, but is on the waitlist for the approval of the HCBA waiver to receive WPCS.</div>
            <div className="mt-3 font-semibold">COMMENTS <span className="font-normal">(optional)</span></div>
            <div className="mt-1 min-h-[115px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[108px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={10}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 5. Environmental Accessibility Adaptations (Home Modifications)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-1 border-y border-black bg-[#ececec] p-2">
              <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
              <div><span className="font-semibold">Description:</span> Physical home adaptations for member&apos;s health, welfare, safety, and independence.</div>
              <div className="mt-2 font-semibold">Key Information:</div>
              <ul className="ml-6 list-disc">
                <li>This service is payable up to a total lifetime maximum of $7,500.</li>
                <li>If Durable Medical Equipment (DME) is available and would accomplish goals, it should be considered first option.</li>
                <li>If the Member is eligible for Home Modifications, a home visit MUST be conducted to confirm appropriateness and feasibility of requested modifications.</li>
                <li><span className="underline">Written consent is required from both</span> the Member and the property owner/landlord.</li>
              </ul>
            </div>
            <div className="mt-3 font-bold">5.1) IS THE MEMBER AT RISK OF BEING INSTITUTIONALIZED IN A NURSING FACILITY?</div>
            <div className="ml-6 mt-1"><Checkbox checked={false} /> No - If selected, do not continue, Member is not eligible for Home Modifications</div>
            <div className="ml-6"><Checkbox checked={false} /> Yes - If selected, continue and question in this section 5.2 and 5.3</div>
            <div className="mt-3 font-bold">5.2) WHAT IS THE MEMBER REQUESTING?</div>
            <div className="ml-6">-> Select <span className="underline">all</span> that apply:</div>
            <div className="ml-8 mt-1"><Checkbox checked={false} /> Home Modification/Adaptation (such as doorway widening to accommodate a wheelchair, tub cut, roll-in shower)</div>
            <div className="ml-8"><Checkbox checked={false} /> Personal Emergency Response System (also known as PERS)</div>
            <div className="ml-8"><Checkbox checked={false} /> Other, please specify:</div>
            <div className="ml-12 mt-1 min-h-[34px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox className="h-[28px]" />
            </div>
            <div className="mt-3 font-bold">5.3) WHAT IS THE MEMBER&apos;S HOME OWNERSHIP STATUS?</div>
            <div className="ml-6">-> Select the <span className="underline">one</span> that applies:</div>
            <div className="ml-8 mt-1"><Checkbox checked={false} /> A) Owns their home</div>
            <div className="ml-8"><Checkbox checked={false} /> B) Rents their home</div>
            <div className="ml-8"><Checkbox checked={false} /> C) Other, please specify:</div>
            <div className="ml-12 mt-1 min-h-[34px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox className="h-[28px]" />
            </div>
            <div className="mt-3 font-semibold">COMMENTS <span className="font-normal">(optional)</span></div>
            <div className="mt-1 min-h-[95px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[88px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={11}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 6. Medically Tailored Meals / Medically Supportive Food (Page 1 of 2)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-1 border-y border-black bg-[#ececec] p-2">
              <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
              <div><span className="font-semibold">Description:</span> Services addressing nutrition-sensitive chronic or acute conditions to improve outcomes and reduce avoidable costs.</div>
              <div className="mt-2 font-semibold">Key Information:</div>
              <ul className="ml-6 list-disc">
                <li>Services may include medically tailored meals, groceries, or nutrition supports based on clinical need.</li>
                <li>Member should have a qualifying chronic condition and a nutrition-related risk factor.</li>
                <li>Referral should include dietary restrictions, allergies, and delivery considerations when applicable.</li>
              </ul>
            </div>
            <div className="mt-3 font-medium">6.1 Condition(s) that would benefit (select all that apply)</div>
            <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
              <div><Checkbox checked={false} /> Post-acute discharge / high hospitalization risk</div>
              <div><Checkbox checked={false} /> Malnutrition (MST ≥3)</div>
              <div><Checkbox checked={false} /> Diabetes (A1C ≥9)</div>
              <div><Checkbox checked={false} /> Cardiovascular disorder</div>
              <div><Checkbox checked={false} /> Congestive heart failure</div>
              <div><Checkbox checked={false} /> Renal failure</div>
              <div><Checkbox checked={false} /> Stroke (post discharge)</div>
              <div><Checkbox checked={false} /> Chronic lung disorders</div>
              <div><Checkbox checked={false} /> HIV with MST ≥3</div>
              <div><Checkbox checked={false} /> Cancer post-hospitalization / active treatment</div>
            </div>
            <FieldLine label="6.2 Special dietary needs / allergies" value="" className="mt-3" />
            <FieldLine label="6.3 Delivery address (if different)" value={memberAddress} className="mt-2" />
          </div>
        </PageShell>

        <PageShell pageNumber={12}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 6. Medically Tailored Meals / Medically Supportive Food (Page 2 of 2)</div>
            <div className="mt-3 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[560px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[552px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={13}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 7. Asthma Remediation (Page 1 of 2)</div>
            <div className="mt-1 h-[2px] w-full bg-black" />
            <div className="mt-1 border-y border-black bg-[#ececec] p-2">
              <div className="text-[16px] font-bold leading-none">Important Information - Please Read</div>
              <div><span className="font-semibold">Description:</span> Assists Members with poorly controlled asthma to address environmental triggers in the home and avoid emergency services or hospitalization.</div>
              <div className="mt-2 font-semibold">Key Information:</div>
              <ul className="ml-6 list-disc">
                <li>Members with poorly controlled asthma (as determined by ED visit/hospitalization criteria or ACT score of 19 or lower) may qualify.</li>
                <li>Asthma remediations are payable up to a total lifetime maximum of $7,500.</li>
                <li>If eligible, a home visit is required to identify asthma triggers and appropriate modifications.</li>
                <li><span className="underline">Written consent is required from both</span> the Member and property owner/landlord before installation.</li>
              </ul>
            </div>
            <div className="mt-3 font-bold">7.1) THE MEMBER MUST HAVE POORLY CONTROLLED ASTHMA AS DOCUMENTED BY:</div>
            <div className="ml-6">-> Select the one that applies:</div>
            <div className="ml-8 mt-1"><Checkbox checked={false} /> A) ED visit, or hospitalization or two sick/urgent care visits in the past 12 months; <span className="font-semibold">OR</span></div>
            <div className="ml-8"><Checkbox checked={false} /> B) Asthma Control Test score of 19 or lower; <span className="font-semibold">OR</span></div>
            <div className="ml-8"><Checkbox checked={false} /> C) Have a recommendation from a licensed health care provider that the service will likely avoid asthma-related hospitalizations, ED visits, and other high-cost services</div>
            <div className="mt-3 font-bold">7.2) WHAT IS THE MEMBER REQUESTING?</div>
            <div className="ml-6">-> Select <span className="underline">all</span> that apply:</div>
            <div className="ml-8 mt-1"><Checkbox checked={false} /> Allergen-impermeable mattress and pillow dustcovers</div>
            <div className="ml-8"><Checkbox checked={false} /> High-efficiency particulate air (HEPA) filtered vacuums</div>
            <div className="ml-8"><Checkbox checked={false} /> Integrated Pest Management (IPM) services</div>
            <div className="ml-8"><Checkbox checked={false} /> De-humidifiers</div>
            <div className="ml-8"><Checkbox checked={false} /> Mechanical air filters/air cleaners</div>
            <div className="ml-8"><Checkbox checked={false} /> Other moisture-controlling interventions</div>
            <div className="ml-8"><Checkbox checked={false} /> Minor mold removal and remediation services</div>
            <div className="ml-8"><Checkbox checked={false} /> Ventilation improvements</div>
            <div className="ml-8"><Checkbox checked={false} /> Asthma-friendly cleaning products and supplies</div>
            <div className="ml-8"><Checkbox checked={false} /> Other interventions; please list below:</div>
            <div className="ml-12 mt-1 min-h-[34px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox className="h-[28px]" />
            </div>
            <div className="mt-3 font-bold">7.3) WHAT IS THE MEMBER&apos;S HOME OWNERSHIP STATUS?</div>
            <div className="ml-6">-> Select the <span className="underline">one</span> that applies:</div>
            <div className="ml-8 mt-1"><Checkbox checked={false} /> A) Owns their home</div>
            <div className="ml-8"><Checkbox checked={false} /> B) Rents their home</div>
            <div className="ml-8"><Checkbox checked={false} /> C) Other, please specify:</div>
            <div className="ml-12 mt-1 min-h-[34px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox className="h-[28px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={14}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 7. Asthma Remediation (Page 2 of 2)</div>
            <div className="mt-3 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[560px] border-2 border-black bg-[#d9e8f7]">
              <EditableBox multiline className="min-h-[552px]" />
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={15} breakAfter={false}>
          <div className="text-lg font-bold">STOP! PLEASE READ BEFORE SUBMITTING</div>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              Complete all required fields to the best of your ability and submit this form via secure email to the
              appropriate region. Incomplete or outdated forms may cause processing delays.
            </p>
            <p>The most updated referral forms can be found on the provider portal.</p>
            <div className="grid grid-cols-1 gap-2 pt-2 md:grid-cols-2">
              <div className="border border-black p-3">
                <div className="font-semibold">Northern California</div>
                <div className="font-mono text-xs">REGMCDURNs-KPNC@KP.org</div>
                <div className="text-[10px]">Provider Portal: NCAL - Provider Portal</div>
              </div>
              <div className="border border-black p-3">
                <div className="font-semibold">Southern California</div>
                <div className="font-mono text-xs">RegCareCoordCaseMgmt@KP.org</div>
                <div className="text-[10px]">Provider Portal: SCal Provider Portal</div>
              </div>
            </div>
          </div>
        </PageShell>
      </div>
      <style jsx global>{`
        .kaiser-referral-packet {
          padding: 12px 0;
          background: #f3f4f6;
        }

        .kaiser-referral-packet .kaiser-packet-page {
          width: 8.5in;
          break-inside: avoid-page;
          page-break-inside: avoid;
          min-height: 11in;
          box-sizing: border-box;
          margin: 0 auto 18px;
          border: 1px solid #d1d5db;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
          border-radius: 0 !important;
        }

        @media print {
          .kaiser-referral-packet {
            padding: 0;
            background: transparent;
          }

          .kaiser-referral-packet .kaiser-packet-page {
            width: auto;
            min-height: 10in;
            margin: 0;
            border: none;
            box-shadow: none;
            page-break-after: always;
          }

          .kaiser-referral-packet .kaiser-packet-page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>
    </PrintableFormLayout>
  );
}

