import type {
  GenerateCharacterMeta,
  GenerateCharacterRequest,
  GenerationQuestion,
  PersistedCharacterData,
} from '@rpgforce-ai/shared';

/**
 * What a pack must provide for the AI wizard.
 *
 * The pipeline is pack-agnostic but every step's SHAPE is not, so the adapter owns the whole
 * two-call pipeline and the module keeps only what generalizes: the LLM wrapper, the retrieval and
 * the interaction record. A second system means a new adapter under `packs/<slug>/`.
 */
export interface PackGenerationAdapter {
  /** Pack slug this adapter serves, matching `Pack.slug`. */
  readonly packSlug: string;

  /**
   * The clarifying round, grounded in the pack's real inventory. `userId` is not used to build
   * anything: it only attributes what the call spends in the AI usage ledger.
   */
  generateQuestions(input: {
    packId: string;
    prompt: string;
    userId?: string | null;
  }): Promise<{ note: string; questions: GenerationQuestion[] }>;

  /** The full draft: retrieval, the model's picks, server-side validation and top-up. */
  generateCharacter(
    req: GenerateCharacterRequest & { userId?: string | null }
  ): Promise<{ draft: PersistedCharacterData; meta: GenerateCharacterMeta }>;
}

/** Injection token for the registered adapters (one per supported pack). */
export const PACK_GENERATION_ADAPTERS = Symbol('PACK_GENERATION_ADAPTERS');
