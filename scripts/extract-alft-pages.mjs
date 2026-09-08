import fs from 'fs';

fs.mkdirSync('src/lib/alft', { recursive: true });

const p = 'src/components/alft/ExactAlftQuestionnaire.tsx';
const s = fs.readFileSync(p, 'utf8');

const optsStart = s.indexOf('const yesNoOptions');
const pagesStart = s.indexOf('export const EXACT_ALFT_PAGES');
const pagesEnd = s.indexOf('\n];', pagesStart) + 3;
if (optsStart < 0 || pagesStart < 0 || pagesEnd < 3) throw new Error('markers not found');

// Include yesNoOptions / adlScale / frequencyOptions + EXACT_ALFT_PAGES
const optsAndPages = s.slice(optsStart, pagesEnd).replace('ExactPage[]', 'ExactAlftPage[]');

const out =
  `/** Shared ALFT page/question schema (server + client safe). */\n` +
  `export type ExactAlftQuestionType = 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';\n` +
  `export type ExactAlftQuestionOption = { value: string; label: string };\n` +
  `export type ExactAlftQuestion = {\n` +
  `  id: string;\n` +
  `  label: string;\n` +
  `  type: ExactAlftQuestionType;\n` +
  `  options?: ExactAlftQuestionOption[];\n` +
  `  placeholder?: string;\n` +
  `  rows?: number;\n` +
  `  required?: boolean;\n` +
  `};\n` +
  `export type ExactAlftPage = { id: string; title: string; questions: ExactAlftQuestion[] };\n\n` +
  optsAndPages +
  '\n';

fs.writeFileSync('src/lib/alft/exact-alft-pages-data.ts', out);
console.log('wrote', out.length, 'chars');
