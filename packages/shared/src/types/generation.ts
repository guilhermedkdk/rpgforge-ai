import type { PersistedCharacterData } from '../schemas/character-sheet-data';

/** One clarifying question the AI asks after the initial concept. */
export interface GenerationQuestion {
  id: string;
  question: string;
  /** Suggested short answers; empty array means freeform. */
  options: string[];
}

export interface GenerateQuestionsRequest {
  /** Pack whose real content inventory grounds the questions (no invented subclasses/options). */
  packId: string;
  prompt: string;
}

export interface GenerateQuestionsResponse {
  /**
   * Opaque id of this wizard interaction. The client carries it (never the payload) through the
   * character call and the sheet save, which is when the server persists the interaction.
   */
  generationId: string;
  /** The AI's interpretation of the concept: how it maps to the SRD, what isn't literal, expectations. */
  note: string;
  questions: GenerationQuestion[];
}

export interface GenerationAnswer {
  question: string;
  answer: string;
  /**
   * True when the user typed the answer instead of clicking one of the offered options. Only a typed
   * answer can be off-topic, so only a typed one is ever reported back as unusable.
   */
  typed?: boolean;
}

export interface GenerateCharacterRequest {
  packId: string;
  prompt: string;
  answers: GenerationAnswer[];
  /** From {@link GenerateQuestionsResponse}; absent only if the clarifying round was skipped. */
  generationId?: string;
}

/** Sheet areas an AI decision can be anchored to (drives the per-section hint icons). */
export type AiDecisionArea =
  | 'identity'
  | 'attributes'
  | 'skills'
  | 'spells'
  | 'equipment'
  | 'features'
  | 'languages';

/** Per-area justification of the AI's picks (one topic bullet per decision), shown as a floating
 * hint on that sheet section. */
export interface AiDecision {
  area: AiDecisionArea;
  /** Short, direct topic bullets — one decision per point. */
  points: string[];
}

/** Per-spell justification anchored to a specific spell row (only for the notable picks). */
export interface AiSpellNote {
  /** Exact spell name (matches a row in the spell list). */
  spell: string;
  reason: string;
}

/** Human-readable summary of what the AI chose (shown in the review step; not persisted in the sheet). */
export interface GenerateCharacterMeta {
  name: string;
  raceName: string | null;
  className: string | null;
  backgroundName: string | null;
  /** Short TL;DR (2-3 sentences); the detailed per-area topics live in `decisions`. */
  summary: string;
  decisions: AiDecision[];
  /** Per-spell reasons for the notable spell picks (spells area is pointed, not one section blob). */
  spellNotes: AiSpellNote[];
  /**
   * What the server had to change relative to what was asked (level clamped to 1-20, an illegal
   * multiclass collapsed, ability scores normalised to the standard array).
   *
   * The pipeline repairs instead of failing, which is right, but repairing SILENTLY is not: the user
   * asks for level 30, gets 20, and has no way to know the app understood them. One short sentence
   * per adjustment, empty when nothing was changed.
   */
  adjustments: string[];
}

/**
 * The AI's justifications for a SAVED sheet, read back from its generation log on demand.
 *
 * Only the two note sets: the rest of the log (prompt, questions, answers) is not what the sheet
 * renders, and keeping this response narrow is what allows the sheet's own load to stay untouched.
 */
export interface SheetAiNotesResponse {
  decisions: AiDecision[];
  spellNotes: AiSpellNote[];
}

export interface GenerateCharacterResponse {
  draft: PersistedCharacterData;
  meta: GenerateCharacterMeta;
  /** Echoed back so the save can link the sheet to the interaction that produced it. */
  generationId?: string;
}

/**
 * What the AI routes answer with as `message` on a 503.
 *
 * Never 429: that status means the CALLER is going too fast, and its copy tells them to wait a few
 * minutes. These two mean the deployment cannot serve AI at all, which waiting does not fix, so
 * they must not borrow that message.
 */
export const AI_BUDGET_EXHAUSTED = 'AI_BUDGET_EXHAUSTED';
export const AI_PROVIDER_UNAVAILABLE = 'AI_PROVIDER_UNAVAILABLE';
