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
      { id: 'p1_assessment_date', label: 'Assessment Date', type: 'text', placeholder: 'YYYY-MM-DD' },
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
      { id: 'p1_limited_english', label: 'Q1: Does client have limited ability to read, write, speaking, or understanding English?', type: 'radio', options: yesNoOptions },
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
      { id: 'p2_current_city', label: 'Current Physical Location City', type: 'text' },
      { id: 'p2_current_state', label: 'Current Physical Location State', type: 'text' },
      { id: 'p2_current_zip', label: 'Current Physical Location Zip', type: 'text' },
      {
        id: 'p2_current_type',
        label: 'Current Physical Location Type',
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
      { id: 'p2_current_type_other', label: 'Current location type other detail', type: 'text' },
      { id: 'p2_facility_name', label: 'Facility name (if type is facility)', type: 'text' },
      { id: 'p2_home_street', label: 'Q4: Home address (if different from current physical location) - Street', type: 'text' },
      { id: 'p2_home_city', label: 'Home Address City', type: 'text' },
      { id: 'p2_home_state', label: 'Home Address State', type: 'text' },
      { id: 'p2_home_zip', label: 'Home Address Zip', type: 'text' },
      { id: 'p2_mail_street', label: 'Q5: Mailing address (if different from current physical location) - Street', type: 'text' },
      { id: 'p2_mail_city', label: 'Mailing Address City', type: 'text' },
      { id: 'p2_mail_state', label: 'Mailing Address State', type: 'text' },
      { id: 'p2_mail_zip', label: 'Mailing Address Zip', type: 'text' },
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
      { id: 'p2_assessment_site_other', label: 'Assessment site other detail', type: 'text' },
      {
        id: 'p2_aps_risk',
        label: 'APS Risk Level',
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
      { id: 'p2_alwp_agency', label: 'ALWP agency (if yes)', type: 'text' },
      { id: 'p2_previous_unsuccessful_placements', label: 'Q9: Has member had previous unsuccessful placements?', type: 'radio', options: yesNoOptions },
      { id: 'p2_previous_placement_explain', label: 'Explain previous unsuccessful placements', type: 'textarea', rows: 3 },
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
      { id: 'p2_living_situation_other', label: 'With other (specify)', type: 'text' },
      { id: 'p2_income_ssi', label: 'Q12: Social Security (SSI) $/Mo', type: 'text' },
      { id: 'p2_income_retirement', label: 'Retirement $/Mo', type: 'text' },
      { id: 'p2_income_ssdi', label: 'SSDI $/Mo', type: 'text' },
      { id: 'p2_income_other', label: 'Other income $/Mo', type: 'text' },
    ],
  },
  {
    id: 'page3',
    title: 'Page 3: Memory and Cognitive Questions',
    questions: [
      { id: 'p3_memory_diagnosis', label: 'Q13: Told by provider of memory/cognitive impairment/dementia/Alzheimer?', type: 'radio', options: yesNoOptions },
      { id: 'p3_client_not_answering', label: 'Q14: Client not answering questions', type: 'radio', options: yesNoOptions },
      { id: 'p3_repeat_sock', label: 'Q15: Repeated "Sock"', type: 'radio', options: yesNoOptions },
      { id: 'p3_repeat_blue', label: 'Q15: Repeated "Blue"', type: 'radio', options: yesNoOptions },
      { id: 'p3_repeat_bed', label: 'Q15: Repeated "Bed"', type: 'radio', options: yesNoOptions },
      {
        id: 'p3_first_attempt_score',
        label: 'Q15 score first attempt',
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
        label: 'Q16 Year orientation',
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
        label: 'Q17 Month orientation',
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
        label: 'Q18 Day of week orientation',
        type: 'select',
        options: [
          { value: 'correct', label: 'Correct' },
          { value: 'incorrect', label: 'Incorrect' },
          { value: 'no_answer', label: 'No answer' },
        ],
      },
      { id: 'p3_recall_sock', label: 'Q19 Recall "Sock"', type: 'radio', options: yesNoOptions },
      { id: 'p3_recall_blue', label: 'Q19 Recall "Blue"', type: 'radio', options: yesNoOptions },
      { id: 'p3_recall_bed', label: 'Q19 Recall "Bed"', type: 'radio', options: yesNoOptions },
      {
        id: 'p3_recall_score',
        label: 'Q20 Number of words correctly recalled',
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
        label: 'Q21 Alert and oriented to',
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
        label: 'Q22 Are cognitive problems present?',
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
    title: 'Pages 4-6: General Health + ADL/IADL',
    questions: [
      { id: 'p4_falls_6_months', label: 'Q23 Number of falls in last six months', type: 'text' },
      { id: 'p4_fall_risk', label: 'Q24 Fall risk?', type: 'radio', options: yesNoOptions },
      { id: 'p4_fall_risk_reason', label: 'Fall risk reason', type: 'textarea', rows: 3 },
      { id: 'p4_er_hospital_60_days', label: 'Q25 ER/hospital in last 60 days?', type: 'radio', options: yesNoOptions },
      { id: 'p4_er_count', label: 'ER count', type: 'text' },
      { id: 'p4_hospital_count', label: 'Hospital count', type: 'text' },
      { id: 'p4_adl_bathing', label: 'Q26 ADL Bathing', type: 'select', options: adlScale },
      { id: 'p4_adl_dressing', label: 'Q26 ADL Dressing', type: 'select', options: adlScale },
      { id: 'p4_adl_eating', label: 'Q26 ADL Eating', type: 'select', options: adlScale },
      { id: 'p4_adl_bathroom', label: 'Q26 ADL Using bathroom', type: 'select', options: adlScale },
      { id: 'p5_adl_transferring', label: 'Q26 ADL Transferring', type: 'select', options: adlScale },
      { id: 'p5_adl_walking_mobility', label: 'Q26 ADL Walking/Mobility', type: 'select', options: adlScale },
      {
        id: 'p5_dme',
        label: 'DME used (check all)',
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
      { id: 'p5_dme_other', label: 'DME other detail', type: 'text' },
      { id: 'p5_iadl_heavy_chores', label: 'Q27 IADL Heavy chores', type: 'select', options: adlScale },
      { id: 'p5_iadl_light_housekeeping', label: 'Q27 IADL Light housekeeping', type: 'select', options: adlScale },
      { id: 'p6_iadl_telephone', label: 'Q27 IADL Using telephone', type: 'select', options: adlScale },
      { id: 'p6_iadl_money', label: 'Q27 IADL Managing money', type: 'select', options: adlScale },
      { id: 'p6_iadl_meals', label: 'Q27 IADL Preparing meals', type: 'select', options: adlScale },
      { id: 'p6_iadl_shopping', label: 'Q27 IADL Shopping', type: 'select', options: adlScale },
      { id: 'p6_iadl_medications', label: 'Q27 IADL Managing medication', type: 'select', options: adlScale },
      { id: 'p6_iadl_transportation', label: 'Q27 IADL Transportation', type: 'select', options: adlScale },
      { id: 'p6_notes_summary', label: 'Sections D/E notes and summary', type: 'textarea', rows: 4 },
    ],
  },
  {
    id: 'page7_8',
    title: 'Pages 7-8: Health Conditions and Therapies',
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
      { id: 'p7_dementia_severity', label: 'Dementia severity', type: 'select', options: [
        { value: 'intact', label: 'Intact' },
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'severe', label: 'Severe' },
      ] },
      { id: 'p7_judgement_severity', label: 'Judgement impairment severity', type: 'select', options: [
        { value: 'intact', label: 'Intact' },
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'severe', label: 'Severe' },
      ] },
      { id: 'p7_smi_specify', label: 'SMI specify', type: 'text' },
      { id: 'p7_sud_specify', label: 'SUD specify', type: 'text' },
      { id: 'p7_other_dx_specify', label: 'Other diagnosis specify', type: 'text' },
      { id: 'p8_catheter_type', label: 'Q29 Catheter type', type: 'select', options: [
        { value: 'na_none', label: 'N/A or None' },
        { value: 'straight_cath', label: 'Straight Cath' },
        { value: 'foley_cath', label: 'Foley Cath' },
      ] },
      { id: 'p8_catheter_frequency', label: 'Catheter frequency/day', type: 'text' },
      { id: 'p8_dialysis_schedule', label: 'Dialysis schedule', type: 'text' },
      { id: 'p8_insulin_assistance_frequency', label: 'Insulin assistance frequency', type: 'text' },
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
      { id: 'p8_oxygen_type', label: 'Oxygen type/details', type: 'text' },
      { id: 'p8_oxygen_liters', label: 'Oxygen liters', type: 'text' },
      { id: 'p8_wound_stage', label: 'Wound stage', type: 'text' },
      { id: 'p8_wound_location', label: 'Wound location', type: 'text' },
      { id: 'p8_home_health_applicable', label: 'Home health/skilled nursing applicable?', type: 'select', options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'not_applicable', label: 'Not Applicable' },
      ] },
      { id: 'p8_visit_frequency', label: 'Visit frequency', type: 'text' },
      { id: 'p8_visit_duties', label: 'Visit duties', type: 'textarea', rows: 3 },
    ],
  },
  {
    id: 'page9_10',
    title: 'Pages 9-10: Mental Health and Nutrition',
    questions: [
      { id: 'p9_mental_diagnosis', label: 'Q31 Diagnosed mental condition/psychiatric disorder?', type: 'radio', options: yesNoOptions },
      { id: 'p9_mental_conditions_list', label: 'List conditions', type: 'textarea', rows: 3 },
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
      { id: 'p10_supervision_needed', label: 'Q34 Client needs supervision?', type: 'radio', options: yesNoOptions },
      { id: 'p10_weight_change', label: 'Q35 Lost or gained weight in last few months?', type: 'select', options: [
        { value: 'unsure', label: 'Unsure' },
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ] },
      { id: 'p10_weight_change_amount', label: 'Weight change amount', type: 'select', options: [
        { value: 'less_than_5', label: 'Less than 5 pounds' },
        { value: '5_to_10', label: '5 to 10 pounds' },
        { value: '10_or_more', label: '10 pounds or more' },
      ] },
      { id: 'p10_weight_change_intentional', label: 'Weight change intentional?', type: 'radio', options: yesNoOptions },
      { id: 'p10_special_diet', label: 'Q36 Special diet for medical reasons?', type: 'radio', options: yesNoOptions },
      {
        id: 'p10_special_diet_types',
        label: 'Special diet types (check all)',
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
      { id: 'p10_special_diet_duration', label: 'How long on this diet?', type: 'text' },
      { id: 'p10_special_diet_reason', label: 'Why on this diet?', type: 'textarea', rows: 3 },
      { id: 'p10_notes_summary', label: 'Section I notes and summary', type: 'textarea', rows: 4 },
    ],
  },
  {
    id: 'page11_12',
    title: 'Pages 11-12: Medications, Advance Directives, Environment, Vision/Hearing',
    questions: [
      { id: 'p11_three_plus_meds', label: 'Q37 Takes 3+ meds/day?', type: 'radio', options: yesNoOptions },
      { id: 'p11_med_reconciliation_complete', label: 'Q38 Medication review complete?', type: 'radio', options: yesNoOptions },
      { id: 'p11_physician_list', label: 'Q39 Physician list (name/phone/last visit/reason)', type: 'textarea', rows: 5 },
      { id: 'p11_advance_directive_present', label: 'Q40 Advance directive present', type: 'text' },
      { id: 'p11_advance_directive_education', label: 'Advance directive education provided', type: 'text' },
      {
        id: 'p11_advance_directive_types',
        label: 'Advance directive type(s)',
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
      { id: 'p11_advance_directive_other', label: 'Advance directive other detail', type: 'text' },
      { id: 'p11_proxy_docs_obtained', label: 'Proxy/guardianship/POA copies obtained?', type: 'radio', options: yesNoOptions },
      { id: 'p11_environment_clutter_free', label: 'Q41 Surroundings free of clutter?', type: 'radio', options: yesNoOptions },
      { id: 'p11_environment_comfortable', label: 'Member comfortable in surroundings?', type: 'radio', options: yesNoOptions },
      { id: 'p12_environment_safe_residence', label: 'Member feels safe in current residence?', type: 'radio', options: yesNoOptions },
      {
        id: 'p12_self_reported_health',
        label: 'Q42 Self-reported health',
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
        label: 'Q43 Religious/spiritual treatment restrictions?',
        type: 'select',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'decline', label: 'Decline' },
        ],
      },
      { id: 'p12_religious_treatment_describe', label: 'Describe restrictions', type: 'textarea', rows: 3 },
      { id: 'p12_special_events_interest', label: 'Would like activities/special events?', type: 'text' },
      { id: 'p12_family_support', label: 'Q44 Family support?', type: 'radio', options: yesNoOptions },
      { id: 'p12_family_support_list', label: 'List family support', type: 'textarea', rows: 3 },
      {
        id: 'p12_vision_status',
        label: 'Q45 Vision status',
        type: 'select',
        options: [
          { value: 'no_vision_problem', label: 'No vision problem' },
          { value: 'yes_vision_problem', label: 'Yes vision problem' },
          { value: 'blind', label: 'Blind' },
        ],
      },
      { id: 'p12_vision_exam_past_year', label: 'Eye exam in past year?', type: 'radio', options: yesNoOptions },
      { id: 'p12_vision_bump_objects', label: "Bumps into objects because can't see?", type: 'radio', options: yesNoOptions },
      {
        id: 'p12_vision_worse_than_last_year',
        label: 'Vision worse than last year',
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
        label: 'Q46 Hearing status',
        type: 'select',
        options: [
          { value: 'no_hearing_problem', label: 'No hearing problem' },
          { value: 'yes_hearing_problem', label: 'Yes hearing problem' },
          { value: 'deaf', label: 'Deaf' },
        ],
      },
      { id: 'p12_hearing_exam_past_year', label: 'Hearing/related exam in past year?', type: 'radio', options: yesNoOptions },
      { id: 'p12_hearing_phone_clarity', label: 'Can understand words over telephone?', type: 'radio', options: yesNoOptions },
      { id: 'p12_hearing_worse_than_last_year', label: 'Hearing worse than last year?', type: 'radio', options: yesNoOptions },
      { id: 'p12_hearing_if_no_why', label: 'If no, why?', type: 'text' },
    ],
  },
  {
    id: 'page13_14',
    title: 'Pages 13-14: Medication Table + RN/MSW Signature',
    questions: [
      {
        id: 'p13_medication_table',
        label: 'Page 13 medication rows (Medication | Dose | Frequency | Taken as Prescribed Y/N | Method | Prescriber)',
        type: 'textarea',
        rows: 8,
      },
      {
        id: 'p13_commentary_section',
        label: 'Commentary section',
        type: 'textarea',
        rows: 12,
      },
      { id: 'p14_additional_details', label: 'Additional details / RN commentary', type: 'textarea', rows: 4 },
      { id: 'p14_print_name', label: 'Print name', type: 'text' },
      { id: 'p14_date', label: 'Date', type: 'text' },
      { id: 'p14_license_number', label: 'License number', type: 'text' },
      {
        id: 'p14_role',
        label: 'MSW / RN (select one)',
        type: 'radio',
        options: [
          { value: 'msw', label: 'MSW' },
          { value: 'rn', label: 'RN' },
        ],
      },
      { id: 'p14_signature_note', label: 'Signature note / confirmation', type: 'text' },
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
        <details key={page.id} className="rounded border p-2">
          <summary className="cursor-pointer text-sm font-medium">{page.title}</summary>
          <div className="mt-3 space-y-3">
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
                      className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

