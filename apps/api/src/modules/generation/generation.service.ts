import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  GenerateCharacterRequest,
  GenerateCharacterResponse,
  GenerateQuestionsResponse,
} from '@rpgforce-ai/shared';
import { PrismaService } from '../../shared/prisma.service';
import { GENERATION_MODEL } from './llm.service';
import { GenerationRunStore } from './generation-run.store';
import { PACK_GENERATION_ADAPTERS, type PackGenerationAdapter } from './pack-generation.adapter';

/**
 * Pack-agnostic half of the AI wizard: resolves which system the request is for, delegates the
 * generation to that pack's adapter, and keeps the interaction record.
 *
 * Everything shaped by a game system (LLM schemas, prompts, choice menus, the draft) belongs to the
 * adapter under `packs/<slug>/`; adding a system never touches this file.
 */
@Injectable()
export class GenerationService {
  private readonly adaptersBySlug: Map<string, PackGenerationAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: GenerationRunStore,
    @Inject(PACK_GENERATION_ADAPTERS) adapters: PackGenerationAdapter[],
  ) {
    this.adaptersBySlug = new Map(adapters.map((a) => [a.packSlug, a]));
  }

  async generateQuestions(
    userId: string,
    packId: string,
    prompt: string,
  ): Promise<GenerateQuestionsResponse> {
    const adapter = await this.adapterFor(packId);
    const { note, questions } = await adapter.generateQuestions({ packId, prompt });

    // Opens the interaction record. It stays server-side until the draft is saved as a sheet, so an
    // abandoned wizard never reaches the database.
    const generationId = this.runs.start({
      userId,
      packId,
      prompt,
      note,
      questions,
      model: GENERATION_MODEL,
    });
    return { generationId, note, questions };
  }

  async generateCharacter(req: GenerateCharacterRequest): Promise<GenerateCharacterResponse> {
    const adapter = await this.adapterFor(req.packId);
    const { draft, meta } = await adapter.generateCharacter(req);

    // Completes the interaction record with what the user answered and how the model justified its
    // picks. Still server-side: it only reaches the database if this draft becomes a sheet.
    if (req.generationId) {
      this.runs.complete(req.generationId, { answers: req.answers, meta });
    }
    return { generationId: req.generationId, draft, meta };
  }

  private async adapterFor(packId: string): Promise<PackGenerationAdapter> {
    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
      select: { slug: true },
    });
    if (!pack) throw new BadRequestException('Pack not found');
    const adapter = this.adaptersBySlug.get(pack.slug);
    // A pack with no adapter is a real limitation, not a server fault: it can be browsed and edited
    // by hand, it just has no AI wizard yet.
    if (!adapter) {
      throw new BadRequestException(`Este sistema ainda não tem criação com IA (${pack.slug}).`);
    }
    return adapter;
  }
}
