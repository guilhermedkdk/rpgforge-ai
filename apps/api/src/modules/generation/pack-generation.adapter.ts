import type {
  GenerateCharacterMeta,
  GenerateCharacterRequest,
  GenerationQuestion,
  PersistedCharacterData,
} from '@rpgforce-ai/shared';

/**
 * What a pack must provide for the AI wizard to work with it.
 *
 * The wizard's PIPELINE is pack-agnostic (ask clarifying questions, then build a sheet from menus
 * enumerated out of the pack's own rule items), but every step's SHAPE is not: the core LLM schema
 * names class/species/background and six ability scores, the choice menus mirror the pack's feature
 * model, and the assembled draft is that system's persisted shape. So the adapter owns the whole
 * two-call pipeline, and the module keeps only what genuinely generalizes: the LLM wrapper, the
 * retrieval, and the interaction record.
 *
 * Adding a second system means writing an adapter under `packs/<slug>/` and registering it, exactly
 * like the web's `systems/registry.tsx` maps a slug to that system's editor.
 */
export interface PackGenerationAdapter {
  /** Pack slug this adapter serves, matching `Pack.slug`. */
  readonly packSlug: string;

  /** The clarifying round, grounded in the pack's real inventory. */
  generateQuestions(input: {
    packId: string;
    prompt: string;
  }): Promise<{ note: string; questions: GenerationQuestion[] }>;

  /** The full draft: retrieval, the model's picks, server-side validation and top-up. */
  generateCharacter(
    req: GenerateCharacterRequest,
  ): Promise<{ draft: PersistedCharacterData; meta: GenerateCharacterMeta }>;
}

/** Injection token for the registered adapters (one per supported pack). */
export const PACK_GENERATION_ADAPTERS = Symbol('PACK_GENERATION_ADAPTERS');
