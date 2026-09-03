'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type QuestionType = 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';

type QuestionOption = {
  value: string;
  label: string;
};

type ExactQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options?: QuestionOption[];
  placeholder?: string;
  rows?: number;
  required?: boolean;
};

type ExactPage = {
  id: string;
  title: string;
  questions: ExactQuestion[];
};

type ExactAnswers = Record<string, string | string[]>;

const yesNoOptions: QuestionOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const adlScale: QuestionOption[] = [
  { value: 'independent', label: 'Independent' },
  { value: 'set_up', label: 'Set up needed' },
  { value: 'supervision', label: 'Needs supervision' },
  { value: 'moderate', label: 'Moderate assistance' },
  { value: 'substantial', label: 'Substantial assistance' },
  { value: 'total', label: 'Total assistance' },
];

const frequencyOptions: QuestionOption[] = [
  { value: 'not_at_all', label: 'Not at all' },
  { value: 'once', label: 'Once' },
  { value: 'several_days', label: 'Several days' },
  { value: 'more_than_half', label: 'More than half the days' },
  { value: 'nearly_every_day', label: 'Nearly every day' },
];

const formatPromptLabel = (label: string) => {
  const qMatch = label.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (qMatch) return `${qMatch[1]}. ${qMatch[2]}`;
  const nMatch = label.match(/^(\d+)\.\s*(.+)$/);
  if (nMatch) return `${nMatch[1]}. ${nMatch[2]}`;
  return label;
};

export const EXACT_ALFT_PAGES: ExactPage[] = [
  {
    id: 'page1',
    title: 'Page 1: Header Information + Demographic',
    questions: [
      { id: 'p1_agency', label: 'Agency', type: 'text' },
      { id: 'p1_assessment_date', label: 'Assessment Date (required: MM/DD/YYYY)', type: 'text', placeholder: 'MM/DD/YYYY', required: true },
      { id: 'p1_plan_id', label: 'Plan ID', type: 'text' },
      { id: 'p1_member_name', label: 'Member Name', type: 'text' },
      { id: 'p1_assessor_name', label: 'Assessor/CM Name', type: 'text' },
      { id: 'p1_referral_date', label: 'Assessor/CM Referral Date', type: 'text', placeholder: 'YYYY-MM-DD' },
      {
        id: 'p1_purpose',
        label: 'Purpose of this assessment',
        type: 'radio',
        options: [
          { value: 'initial', label: 'Initial' },
          { value: 'change_condition', label: 'Change of Condition' },
          { value: 'review', label: 'Review' },
        ],
      },
      { id: 'p1_other_responder', label: 'Is someone besides client answering?', type: 'radio', options: yesNoOptions },
      { id: 'p1_other_responder_name', label: 'If yes, name', type: 'text' },
      { id: 'p1_other_responder_relationship', label: 'If yes, relationship', type: 'text' },
      { id: 'p1_first_name', label: 'First Name', type: 'text' },
      { id: 'p1_middle_name', label: 'Middle Name', type: 'text' },
      { id: 'p1_last_name', label: 'Last Name', type: 'text' },
      { id: 'p1_mrn', label: 'MRN Number', type: 'text' },
      { id: 'p1_phone', label: 'Phone Number', type: 'text' },
      { id: 'p1_dob', label: 'Date of Birth', type: 'text' },
      { id: 'p1_sex', label: 'Sex', type: 'text' },
      {
        id: 'p1_race',
        label: 'Race (check all that apply)',
        type: 'checkboxGroup',
        options: [
          { value: 'american_indian_alaska_native', label: 'American Indian/Alaska Native' },
          { value: 'asian', label: 'Asian' },
          { value: 'black_african_american', label: 'Black/African American' },
          { value: 'native_hawaiian_pacific_islander', label: 'Native Hawaiian/Pacific Islander' },
          { value: 'white', label: 'White' },
          { value: 'other', label: 'Other' },
        ],
      },
      { id: 'p1_race_other', label: 'Race other detail', type: 'text' },
      { id: 'p1_ethnicity', label: 'Ethnicity', type: 'text' },
      { id: 'p1_ethnicity_hispanic', label: 'Hispanic/Latino', type: 'radio', options: yesNoOptions },
      { id: 'p1_ethnicity_other', label: 'Ethnicity other detail', type: 'text' },
      { id: 'p1_primary_language', label: 'Primary Language', type: 'text' },
      { id: 'p1_limited_english', label: 'Q1: Does client have limited ability to reading, writing, speaking, or understanding English?', type: 'radio', options: yesNoOptions },
      {
        id: 'p1_marital_status',
        label: 'Q2: Marital Status',
        type: 'select',
        options: [
          { value: 'married', label: 'Married' },
          { value: 'single', label: 'Single' },
          { value: 'divorced', label: 'Divorced' },
          { value: 'partnered', label: 'Partnered' },
          { value: 'separated', label: 'Separated' },
          { value: 'widowed', label: 'Widowed' },
        ],
      },
    ],
  },
  {
    id: 'page2',
    title: 'Page 2: Addresses, Site, Risk, Living Situation, Income',
    questions: [
      { id: 'p2_current_street', label: 'Q3: Assessor/CM current physical location address - Street', type: 'text' },
      { id: 'p2_current_city', label: 'Q3: Current Physical Location City', type: 'text' },
      { id: 'p2_current_state', label: 'Q3: Current Physical Location State', type: 'text' },
      { id: 'p2_current_zip', label: 'Q3: Current Physical Location Zip', type: 'text' },
      {
        id: 'p2_current_type',
        label: 'Q3: Current Physical Location Type',
        type: 'select',
        options: [
          { value: 'private_residence', label: 'Private Residence' },
          { value: 'alf', label: 'Assisted Living Facility (ALF)' },
          { value: 'nursing_facility', label: 'Nursing Facility' },
          { value: 'hospital', label: 'Hospital' },
          { value: 'adult_day_care', label: 'Adult Day Care' },
          { value: 'other', label: 'Other' },
        ],
      },
      { id: 'p2_current_type_other', label: 'Q3: Current location type other detail', type: 'text' },
      { id: 'p2_facility_name', label: 'Q3: Facility name (if type is facility)', type: 'text' },
      { id: 'p2_home_street', label: 'Q4: Home address (if different from current physical location) - Street', type: 'text' },
      { id: 'p2_home_city', label: 'Q4: Home Address City', type: 'text' },
      { id: 'p2_home_state', label: 'Q4: Home Address State', type: 'text' },
      { id: 'p2_home_zip', label: 'Q4: Home Address Zip', type: 'text' },
      { id: 'p2_mail_street', label: 'Q5: Mailing address (if different from current physical location) - Street', type: 'text' },
      { id: 'p2_mail_city', label: 'Q5: Mailing Address City', type: 'text' },
      { id: 'p2_mail_state', label: 'Q5: Mailing Address State', type: 'text' },
      { id: 'p2_mail_zip', label: 'Q5: Mailing Address Zip', type: 'text' },
      {
        id: 'p2_assessment_site',
        label: 'Q6: Assessor/CM assessment site',
        type: 'select',
        options: [
          { value: 'home', label: 'Home' },
          { value: 'nursing_facility', label: 'Nursing Facility' },
          { value: 'hospital', label: 'Hospital' },
          { value: 'alf', label: 'ALF' },
          { value: 'adult_day_care', label: 'Adult Day Care' },
          { value: 'other', label: 'Other' },
        ],
      },
      { id: 'p2_assessment_site_other', label: 'Q6: Assessment site other detail', type: 'text' },
      {
        id: 'p2_aps_risk',
        label: 'Q6: APS Risk Level',
        type: 'select',
        options: [
          { value: 'high', label: 'High' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'low', label: 'Low' },
          { value: 'not_applicable', label: 'Not Applicable' },
        ],
      },
      {
        id: 'p2_imminent_nursing_home_risk',
        label: 'Q7: Imminent risk of nursing home placement?',
        type: 'select',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'not_applicable', label: 'Not Applicable' },
        ],
      },
      { id: 'p2_alwp_waitlist', label: 'Q8: Is member on the ALWP waitlist?', type: 'radio', options: yesNoOptions },
      { id: 'p2_alwp_agency', label: 'Q8: ALWP agency (if yes)', type: 'text' },
      { id: 'p2_previous_unsuccessful_placements', label: 'Q9: Has member had previous unsuccessful placements?', type: 'radio', options: yesNoOptions },
      { id: 'p2_previous_placement_explain', label: 'Q9: Explain previous unsuccessful placements', type: 'textarea', rows: 3 },
      { id: 'p2_primary_caregiver', label: 'Q10: Is there a primary caregiver?', type: 'radio', options: yesNoOptions },
      {
        id: 'p2_living_situation',
        label: 'Q11: Living situation',
        type: 'select',
        options: [
          { value: 'with_primary_caregiver', label: 'With Primary Caregiver' },
          { value: 'with_other', label: 'With Other' },
          { value: 'alone', label: 'Alone' },
        ],
      },
      { id: 'p2_living_situation_other', label: 'Q11: With other (specify)', type: 'text' },
      { id: 'p2_income_ssi', label: 'Q12: Social Security (SSI) $/Mo', type: 'text' },
      { id: 'p2_income_retirement', label: 'Q12: Retirement $/Mo', type: 'text' },
      { id: 'p2_income_ssdi', label: 'Q12: SSDI $/Mo', type: 'text' },
      { id: 'p2_income_other', label: 'Q12: Other income $/Mo', type: 'text' },
    ],
  },
  {
    id: 'page3',
    title: 'Page 3: Memory and Cognitive Questions',
    questions: [
      { id: 'p3_memory_diagnosis', label: "Q13: Has a doctor or other healthcare professional told you that you suffer from memory loss, cognitive impairment, any type of dementia, or Alzheimer's disease?", type: 'radio', options: yesNoOptions },
      { id: 'p3_client_not_answering', label: 'Q14: ASSESSOR/CM: If the client is not answering, skip to Question 20 and check the box below: Client not answering questions', type: 'radio', options: yesNoOptions },
      { id: 'p3_repeat_sock', label: 'Q15: Now you tell me the three words - Sock', type: 'radio', options: yesNoOptions },
      { id: 'p3_repeat_blue', label: 'Q15: Now you tell me the three words - Blue', type: 'radio', options: yesNoOptions },
      { id: 'p3_repeat_bed', label: 'Q15: Now you tell me the three words - Bed', type: 'radio', options: yesNoOptions },
      {
        id: 'p3_first_attempt_score',
        label: 'Q15: ASSESSOR/CM: Total number of correct words after first attempt',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
          { value: 'three', label: 'Three' },
        ],
      },
      {
        id: 'p3_year_orientation',
        label: 'Q16: Tell me what year it is?',
        type: 'select',
        options: [
          { value: 'correct', label: 'Correct' },
          { value: 'missed_one_year', label: 'Missed by one year' },
          { value: 'missed_two_to_five_years', label: 'Missed by two to five years' },
          { value: 'missed_five_or_more_years', label: 'Missed by five or more years' },
          { value: 'no_answer', label: 'No answer' },
        ],
      },
      {
        id: 'p3_month_orientation',
        label: 'Q17: Please tell me what month it is:',
        type: 'select',
        options: [
          { value: 'correct', label: 'Correct' },
          { value: 'missed_one_month', label: 'Missed by one month' },
          { value: 'missed_two_to_five_months', label: 'Missed by two to five months' },
          { value: 'missed_five_or_more_months', label: 'Missed by five or more months' },
          { value: 'no_answer', label: 'No answer' },
        ],
      },
      {
        id: 'p3_day_orientation',
        label: 'Q18: Please tell me what day (of the week) it is:',
        type: 'select',
        options: [
          { value: 'correct', label: 'Correct' },
          { value: 'incorrect', label: 'Incorrect' },
          { value: 'no_answer', label: 'No answer' },
        ],
      },
      { id: 'p3_recall_sock', label: 'Q19: Let’s go back to an earlier question - Sock', type: 'radio', options: yesNoOptions },
      { id: 'p3_recall_blue', label: 'Q19: Let’s go back to an earlier question - Blue', type: 'radio', options: yesNoOptions },
      { id: 'p3_recall_bed', label: 'Q19: Let’s go back to an earlier question - Bed', type: 'radio', options: yesNoOptions },
      {
        id: 'p3_recall_score',
        label: 'Q20: ASSESSOR/CM: Number of words correctly recalled without prompting',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
          { value: 'three', label: 'Three' },
        ],
      },
      {
        id: 'p3_oriented_to',
        label: "Q21: ASSESSOR/COM: Member is alert and oriented to",
        type: 'checkboxGroup',
        options: [
          { value: 'time', label: 'Time' },
          { value: 'place', label: 'Place' },
          { value: 'person', label: 'Person' },
          { value: 'event', label: 'Event' },
        ],
      },
      {
        id: 'p3_cognitive_problems_present',
        label: 'Q22: ASSESSOR/CM: In your opinion, are cognitive problems present?',
        type: 'select',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'dont_know', label: "Don't know" },
        ],
      },
    ],
  },
  {
    id: 'page4_6',
    title: 'Pages 4-6: GENERAL HEALTH, SENSORY, AND COMMUNICATION + ADL/IADL',
    questions: [
      { id: 'p4_falls_6_months', label: 'Q23: How many times have you fall in the last six months?', type: 'text' },
      { id: 'p4_fall_risk', label: 'Q24: Is a member at fall risk?', type: 'radio', options: yesNoOptions },
      { id: 'p4_fall_risk_reason', label: 'Q24: If yes, please explain why:', type: 'textarea', rows: 3 },
      { id: 'p4_er_hospital_60_days', label: 'Q25: Have you visited the emergency room (ER) or been admitted to the hospital within the last 60 days?', type: 'radio', options: yesNoOptions },
      { id: 'p4_er_count', label: 'Q25: If yes, how many times? ER #', type: 'text' },
      { id: 'p4_hospital_count', label: 'Q25: If yes, how many times? Hospital #', type: 'text' },
      { id: 'p4_adl_bathing', label: 'Q26 ADL Bathing', type: 'select', options: adlScale },
      { id: 'p4_adl_dressing', label: 'Q26 ADL Dressing', type: 'select', options: adlScale },
      { id: 'p4_adl_eating', label: 'Q26 ADL Eating', type: 'select', options: adlScale },
      { id: 'p4_adl_bathroom', label: 'Q26 ADL Using bathroom', type: 'select', options: adlScale },
      { id: 'p5_adl_transferring', label: 'Q26 ADL Transferring', type: 'select', options: adlScale },
      { id: 'p5_adl_walking_mobility', label: 'Q26 ADL Walking/Mobility', type: 'select', options: adlScale },
      {
        id: 'p5_dme',
        label: 'Q26: DME used (check all)',
        type: 'checkboxGroup',
        options: [
          { value: 'shower_chair', label: 'Shower Chair' },
          { value: 'sliding_board', label: 'Sliding Board' },
          { value: 'wheelchair', label: 'Wheelchair' },
          { value: 'commode_chair', label: 'Commode Chair' },
          { value: 'walker', label: 'Walker' },
          { value: 'hoyer_lift', label: 'Hoyer Lift' },
          { value: 'other', label: 'Other' },
        ],
      },
      { id: 'p5_dme_other', label: 'Q26: DME other detail', type: 'text' },
      { id: 'p5_iadl_heavy_chores', label: 'Q27 IADL Heavy chores', type: 'select', options: adlScale },
      { id: 'p5_iadl_light_housekeeping', label: 'Q27 IADL Light housekeeping', type: 'select', options: adlScale },
      { id: 'p6_iadl_telephone', label: 'Q27 IADL Using telephone', type: 'select', options: adlScale },
      { id: 'p6_iadl_money', label: 'Q27 IADL Managing money', type: 'select', options: adlScale },
      { id: 'p6_iadl_meals', label: 'Q27 IADL Preparing meals', type: 'select', options: adlScale },
      { id: 'p6_iadl_shopping', label: 'Q27 IADL Shopping', type: 'select', options: adlScale },
      { id: 'p6_iadl_medications', label: 'Q27 IADL Managing medication', type: 'select', options: adlScale },
      { id: 'p6_iadl_transportation', label: 'Q27 IADL Transportation', type: 'select', options: adlScale },
      { id: 'p6_section_d_text', label: 'SECTION D. Notes and Summary:', type: 'textarea', rows: 3 },
      { id: 'p6_section_e_text', label: 'SECTION E. Notes and Summary:', type: 'textarea', rows: 3 },
      { id: 'p6_section_f_text', label: 'SECTION F. Notes and Summary:', type: 'textarea', rows: 3 },
      { id: 'p6_notes_summary', label: 'SECTION B. Notes and Summary:', type: 'textarea', rows: 4 },
    ],
  },
  {
    id: 'page7_8',
    title: 'Pages 7-8: HEALTH CONDITIONS AND THERAPIES',
    questions: [
      {
        id: 'p7_conditions',
        label: 'Q28 Health conditions (check all)',
        type: 'checkboxGroup',
        options: [
          { value: 'alzheimers_dementia', label: "Alzheimer's/Dementia" },
          { value: 'memory_impairment', label: 'Memory impairment' },
          { value: 'judgement_impairment', label: 'Judgement/decision-making impairment' },
          { value: 'arthritis_pain', label: 'Arthritis/joint pain' },
          { value: 'asthma', label: 'Asthma' },
          { value: 'cancer', label: 'Cancer' },
          { value: 'chf_swelling', label: 'CHF/foot-ankle-leg swelling' },
          { value: 'depression', label: 'Depression' },
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'lung_disease', label: 'Lung disease/COPD/chronic bronchitis' },
          { value: 'heart_attack_blocked_arteries', label: 'Heart attack/blocked arteries' },
          { value: 'high_blood_pressure', label: 'High blood pressure' },
          { value: 'high_cholesterol', label: 'High cholesterol/triglycerides' },
          { value: 'hiv_aids', label: 'HIV/AIDS' },
          { value: 'hospice', label: 'Hospice' },
          { value: 'palliative', label: 'Palliative care' },
          { value: 'pain_management', label: 'Pain management' },
          { value: 'kidney_dialysis', label: 'Kidney problems/dialysis' },
          { value: 'incontinence_urine', label: 'Incontinence (urine)' },
          { value: 'incontinence_stool', label: 'Incontinence (stool)' },
          { value: 'incontinence_both', label: 'Incontinence (both)' },
          { value: 'organ_transplant', label: 'Organ transplant' },
          { value: 'skin_ulcer_wound', label: 'Skin ulcer/non-healing wound' },
          { value: 'stroke', label: 'Stroke' },
          { value: 'severe_mental_illness', label: 'Severe mental illness (SMI)' },
          { value: 'sud', label: 'Substance use disorder (SUD)' },
          { value: 'traumatic_brain_injury', label: 'Traumatic brain injury' },
          { value: 'other_dx', label: 'Other diagnosis' },
          { value: 'decline_to_answer', label: 'Decline to answer' },
          { value: 'none', label: 'None' },
        ],
      },
      { id: 'p7_dementia_severity', label: 'Q28: Dementia severity', type: 'select', options: [
        { value: 'intact', label: 'Intact' },
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'severe', label: 'Severe' },
      ] },
      { id: 'p7_judgement_severity', label: 'Q28: Judgement impairment severity', type: 'select', options: [
        { value: 'intact', label: 'Intact' },
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'severe', label: 'Severe' },
      ] },
      { id: 'p7_smi_specify', label: 'Q28: SMI specify', type: 'text' },
      { id: 'p7_sud_specify', label: 'Q28: SUD specify', type: 'text' },
      { id: 'p7_other_dx_specify', label: 'Q28: Other diagnosis specify', type: 'text' },
      { id: 'p8_catheter_type', label: 'Q29 Catheter type', type: 'select', options: [
        { value: 'na_none', label: 'N/A or None' },
        { value: 'straight_cath', label: 'Straight Cath' },
        { value: 'foley_cath', label: 'Foley Cath' },
      ] },
      { id: 'p8_catheter_frequency', label: 'Q29: Catheter frequency/day', type: 'text' },
      { id: 'p8_dialysis_schedule', label: 'Q29: Dialysis schedule', type: 'text' },
      { id: 'p8_insulin_assistance_frequency', label: 'Q29: Insulin assistance frequency', type: 'text' },
      {
        id: 'p8_services',
        label: 'Q30 Services received (check all)',
        type: 'checkboxGroup',
        options: [
          { value: 'iv_fluids_meds', label: 'IV fluids/IV medications' },
          { value: 'ostomy_care', label: 'Ostomy care' },
          { value: 'oxygen', label: 'Oxygen' },
          { value: 'physical_therapy', label: 'Physical therapy' },
          { value: 'speech_therapy', label: 'Speech therapy' },
          { value: 'radiation_chemo', label: 'Radiation/Chemotherapy' },
          { value: 'suctioning', label: 'Suctioning' },
          { value: 'tube_feeding', label: 'Tube feeding' },
          { value: 'occupational_therapy', label: 'Occupational therapy' },
          { value: 'respiratory_therapy', label: 'Respiratory therapy' },
          { value: 'wound_care', label: 'Wound care/lesion irrigation' },
          { value: 'other_therapies', label: 'Other therapies' },
          { value: 'home_health', label: 'Home health' },
          { value: 'skilled_nursing', label: 'Skilled nursing' },
        ],
      },
      { id: 'p8_oxygen_type', label: 'Q30: Oxygen type/details', type: 'text' },
      { id: 'p8_oxygen_liters', label: 'Q30: Oxygen liters', type: 'text' },
      { id: 'p8_wound_stage', label: 'Q30: Wound stage', type: 'text' },
      { id: 'p8_wound_location', label: 'Q30: Wound location', type: 'text' },
      { id: 'p8_home_health_applicable', label: 'Q30: Home health/skilled nursing applicable?', type: 'select', options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'not_applicable', label: 'Not Applicable' },
      ] },
      { id: 'p8_visit_frequency', label: 'Q30: Visit frequency', type: 'text' },
      { id: 'p8_visit_duties', label: 'Q30: Visit duties', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'page9_10',
    title: 'Pages 9-10: MENTAL HEALTH and NUTRITION',
    questions: [
      { id: 'p9_mental_diagnosis', label: 'Q31 Diagnosed mental condition/psychiatric disorder?', type: 'radio', options: yesNoOptions },
      { id: 'p9_mental_conditions_list', label: 'Q31: List conditions', type: 'textarea', rows: 3 },
      { id: 'p9_self_harm_thoughts', label: 'Q32 Thoughts of being better off dead/self-harm?', type: 'select', options: [
        { value: 'yes', label: 'Yes (PHQ9 required)' },
        { value: 'no', label: 'No' },
        { value: 'decline', label: 'Decline to answer' },
      ] },
      { id: 'p9_behavior_forgetful', label: 'Q33 Forgetful/easily confused', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_wandering', label: 'Q33 Gets lost or wanders off', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_agitated', label: 'Q33 Easily agitated/disruptive', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_sexual', label: 'Q33 Sexually inappropriate', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_verbal_hostile', label: 'Q33 Threatens/is verbally hostile', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_physical_aggressive', label: 'Q33 Physically aggressive/violent', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_self_injury', label: 'Q33 Intentionally harms self', type: 'select', options: frequencyOptions },
      { id: 'p9_behavior_suicidal_expression', label: 'Q33 Expresses suicidal feelings/plans', type: 'select', options: frequencyOptions },
      { id: 'p10_behavior_hallucinations', label: 'Q33 Hallucinates', type: 'select', options: [...frequencyOptions, { value: 'other', label: 'Other' }] },
      { id: 'p10_behavior_other', label: 'Q33 Other problem/behavior', type: 'select', options: [...frequencyOptions, { value: 'other', label: 'Other' }] },
      { id: 'p10_supervision_needed', label: 'Q34: ASSESSOR/CM: Does client need supervision?', type: 'radio', options: yesNoOptions },
      { id: 'p10_weight_change', label: 'Q35 Lost or gained weight in last few months?', type: 'select', options: [
        { value: 'unsure', label: 'Unsure' },
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ] },
      { id: 'p10_weight_change_amount', label: 'Q35 Weight change amount', type: 'select', options: [
        { value: 'less_than_5', label: 'Less than 5 pounds' },
        { value: '5_to_10', label: '5 to 10 pounds' },
        { value: '10_or_more', label: '10 pounds or more' },
      ] },
      { id: 'p10_weight_change_intentional', label: 'Q35 Weight change intentional?', type: 'radio', options: yesNoOptions },
      { id: 'p10_special_diet', label: 'Q36 Special diet for medical reasons?', type: 'radio', options: yesNoOptions },
      {
        id: 'p10_special_diet_types',
        label: 'Q36 Special diet types (check all)',
        type: 'checkboxGroup',
        options: [
          { value: 'low_fat_cholesterol', label: 'Low fat/cholesterol' },
          { value: 'low_salt_sodium', label: 'Low salt/sodium' },
          { value: 'puree', label: 'Puree diet' },
          { value: 'medically_altered', label: 'Medically altered diet' },
          { value: 'calorie_supplement', label: 'Calorie supplement' },
          { value: 'low_sugar_carb', label: 'Low sugar/carb' },
          { value: 'other', label: 'Other' },
        ],
      },
      { id: 'p10_special_diet_duration', label: 'Q36 How long on this diet?', type: 'text' },
      { id: 'p10_special_diet_reason', label: 'Q36 Why on this diet?', type: 'textarea', rows: 3 },
      { id: 'p10_notes_summary', label: 'SECTION I. Notes and Summary:', type: 'textarea', rows: 4 },
    ],
  },
  {
    id: 'page11_12',
    title: 'Pages 11-12: MEDICATION AND SUBSTANCE USE + Advance Directive + Environment + Vision/Hearing',
    questions: [
      { id: 'p11_three_plus_meds', label: 'Q37: Do you take three or more prescribed or over-the-counter medication a day?', type: 'radio', options: yesNoOptions },
      { id: 'p11_med_reconciliation_complete', label: 'Q38: May I see all the medication you take, both regularly and those taken only as needed?', type: 'radio', options: yesNoOptions },
      { id: 'p11_physician_list', label: 'Q39: Please list the doctors you usually go to for treatment and medications', type: 'textarea', rows: 5 },
      { id: 'p11_advance_directive_present', label: 'Q40: Does the member have an Advance Directive?', type: 'text' },
      { id: 'p11_advance_directive_education', label: 'Q40: Was education provided?', type: 'text' },
      {
        id: 'p11_advance_directive_types',
        label: 'Q40 Advance directive type(s)',
        type: 'checkboxGroup',
        options: [
          { value: 'living_will', label: 'Living Will' },
          { value: 'healthcare_surrogate_proxy', label: 'Healthcare surrogate/proxy' },
          { value: 'dnr', label: 'DNR' },
          { value: 'power_of_attorney', label: 'Power of Attorney' },
          { value: 'guardianship', label: 'Guardianship' },
          { value: 'other', label: 'Other' },
          { value: 'declines_advance_directive', label: 'Member/caregiver declines at this time' },
        ],
      },
      { id: 'p11_advance_directive_other', label: 'Q40 Advance directive other detail', type: 'text' },
      { id: 'p11_proxy_docs_obtained', label: 'Q40 Proxy/guardianship/POA copies obtained?', type: 'radio', options: yesNoOptions },
      { id: 'p11_environment_clutter_free', label: 'Q41: Is member surround free of clutter?', type: 'radio', options: yesNoOptions },
      { id: 'p11_environment_comfortable', label: 'Q41: Does member feel comfortable in their surroundings?', type: 'radio', options: yesNoOptions },
      { id: 'p12_environment_safe_residence', label: 'Q41: Does member feel safe in Current Residence?', type: 'radio', options: yesNoOptions },
      {
        id: 'p12_self_reported_health',
        label: 'Q42: Ask: "In general, how would you rate your health?"',
        type: 'select',
        options: [
          { value: 'excellent', label: 'Excellent' },
          { value: 'good', label: 'Good' },
          { value: 'fair', label: 'Fair' },
          { value: 'poor', label: 'Poor' },
          { value: 'could_not_respond', label: 'Could not/would not respond' },
        ],
      },
      {
        id: 'p12_religious_treatment_limits',
        label: 'Q43: Do you have health care treatments or procedures that are religiously or spiritually discouraged or not allowed?',
        type: 'select',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'decline', label: 'Decline' },
        ],
      },
      { id: 'p12_religious_treatment_describe', label: 'Q43: If yes, please describe:', type: 'textarea', rows: 3 },
      { id: 'p12_special_events_interest', label: 'Q43: Would you like to be involved in any activities or special events?', type: 'text' },
      { id: 'p12_family_support', label: 'Q44: Does member have family support?', type: 'radio', options: yesNoOptions },
      { id: 'p12_family_support_list', label: 'Q44: If yes, please list family support.', type: 'textarea', rows: 3 },
      {
        id: 'p12_vision_status',
        label: 'Q45: Has a doctor told you that you currently have vision problems?',
        type: 'select',
        options: [
          { value: 'no_vision_problem', label: 'No vision problem' },
          { value: 'yes_vision_problem', label: 'Yes vision problem' },
          { value: 'blind', label: 'Blind' },
        ],
      },
      { id: 'p12_vision_exam_past_year', label: 'Q45: Have you had an eye exam in the past year?', type: 'radio', options: yesNoOptions },
      { id: 'p12_vision_bump_objects', label: "Q45: Do you bump into objects (people, doorways) because you don't see them?", type: 'radio', options: yesNoOptions },
      {
        id: 'p12_vision_worse_than_last_year',
        label: 'Q45: Is your vision getting worse than it was last year?',
        type: 'select',
        options: [
          { value: 'no', label: 'No' },
          { value: 'one_eye', label: 'In one eye' },
          { value: 'slightly_worse', label: 'Slightly worse' },
          { value: 'much_worse', label: 'Much worse' },
        ],
      },
      {
        id: 'p12_hearing_status',
        label: 'Q46: Has a doctor told you that you currently having hearing problems?',
        type: 'select',
        options: [
          { value: 'no_hearing_problem', label: 'No hearing problem' },
          { value: 'yes_hearing_problem', label: 'Yes hearing problem' },
          { value: 'deaf', label: 'Deaf' },
        ],
      },
      { id: 'p12_hearing_exam_past_year', label: 'Q46: Have you had an hearing exam in the past year?', type: 'radio', options: yesNoOptions },
      { id: 'p12_hearing_phone_clarity', label: 'Q46: Can you understand words clearly over the telephone?', type: 'radio', options: yesNoOptions },
      { id: 'p12_hearing_worse_than_last_year', label: 'Q46: Is your hearing worse than it was last year?', type: 'radio', options: yesNoOptions },
      { id: 'p12_hearing_if_no_why', label: 'Q46: If No, why?', type: 'text' },
    ],
  },
  {
    id: 'page13_14',
    title: 'Pages 13-14: MEDICATIONS + RN/MSW SIGNATURE',
    questions: [
      {
        id: 'p13_medication_table',
        label: 'Page 13: Medication Name/Prescribed Dose, Prescribed Frequency, Taken as Prescribed (Y/N), Administration Method, Prescriber Name',
        type: 'textarea',
        rows: 8,
      },
      {
        id: 'p13_commentary_section',
        label: 'Page 14: Additional Details/RN Commentary:',
        type: 'textarea',
        rows: 18,
      },
      { id: 'p14_print_name', label: 'MSW print name', type: 'text' },
      { id: 'p14_date', label: 'Date', type: 'text' },
      { id: 'p14_sw_signed_at', label: 'MSW electronic timestamp', type: 'text' },
      { id: 'p14_license_number', label: 'License number', type: 'text' },
      { id: 'p14_rn_print_name', label: 'RN print name', type: 'text' },
      { id: 'p14_rn_signed_at', label: 'RN electronic timestamp', type: 'text' },
    ],
  },
];

export function createInitialExactAlftAnswers(): ExactAnswers {
  const initial: ExactAnswers = {};
  EXACT_ALFT_PAGES.forEach((page) => {
    page.questions.forEach((q) => {
      initial[q.id] = q.type === 'checkboxGroup' ? [] : '';
    });
  });
  return initial;
}

export function ExactAlftQuestionnaire({
  answers,
  onChange,
}: {
  answers: ExactAnswers;
  onChange: (id: string, value: string | string[]) => void;
}) {
  const toggleCheckbox = (id: string, value: string) => {
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange(id, next);
  };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="text-sm font-semibold">Exact ALFT 1:1 questionnaire (all pages/questions)</div>
      <div className="text-xs text-muted-foreground">
        Complete this section for exact 1:1 ALFT packet capture. These are stored as structured answers by question id.
      </div>

      {EXACT_ALFT_PAGES.map((page) => (
        <details key={page.id} className="rounded border border-sky-700 overflow-hidden">
          <summary className="cursor-pointer text-sm font-semibold bg-sky-700 text-white px-3 py-2 uppercase tracking-wide print:bg-sky-700 print:text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            {page.title}
          </summary>
          <div className="mt-3 px-3 pb-3 space-y-3">
            {page.questions.map((q) => {
              const value = answers[q.id] ?? (q.type === 'checkboxGroup' ? [] : '');
              return (
                <div key={q.id} className="space-y-1">
                  <Label className="text-xs">{formatPromptLabel(q.label)}</Label>

                  {q.type === 'text' ? (
                    <Input
                      value={String(value)}
                      placeholder={q.placeholder}
                      onChange={(e) => onChange(q.id, e.target.value)}
                    />
                  ) : null}

                  {q.type === 'textarea' ? (
                    <textarea
                      value={String(value)}
                      placeholder={q.placeholder}
                      onChange={(e) => onChange(q.id, e.target.value)}
                      className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                        q.id === 'p13_commentary_section' ? 'min-h-[420px]' : 'min-h-[72px]'
                      }`}
                      rows={q.rows ?? 3}
                    />
                  ) : null}

                  {q.type === 'select' ? (
                    <select
                      value={String(value)}
                      onChange={(e) => onChange(q.id, e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select...</option>
                      {(q.options || []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {q.type === 'radio' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-2">
                      {(q.options || []).map((opt) => (
                        <label key={opt.value} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.value}
                            checked={String(value) === opt.value}
                            onChange={(e) => onChange(q.id, e.target.value)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {q.type === 'checkboxGroup' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-2">
                      {(q.options || []).map((opt) => (
                        <label key={opt.value} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Array.isArray(value) ? value.includes(opt.value) : false}
                            onChange={() => toggleCheckbox(q.id, opt.value)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

