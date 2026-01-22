import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import anthropic from 'genkitx-anthropic';

export const ai = genkit({
  plugins: [
    googleAI(),
    anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    }),
  ],
});
