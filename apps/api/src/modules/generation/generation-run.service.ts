import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AiDecision, AiSpellNote, SheetAiNotesResponse } from '@rpgforce-ai/shared';
import { PrismaService } from '../../shared/prisma.service';
import { GenerationRunStore } from './generation-run.store';

const EMPTY_NOTES: SheetAiNotesResponse = { decisions: [], spellNotes: [] };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

// `meta` is a JSON column written by whichever version of the app produced the run, so a row can
// predate a shape change. Reading it defensively costs one pass and keeps an old sheet's notes from
// crashing its page.
const parseNotes = (meta: Prisma.JsonValue): SheetAiNotesResponse => {
  const record = asRecord(meta);
  if (!record) return EMPTY_NOTES;

  const decisions: AiDecision[] = [];
  for (const entry of Array.isArray(record.decisions) ? record.decisions : []) {
    const decision = asRecord(entry);
    if (!decision || typeof decision.area !== 'string') continue;
    const points = asStrings(decision.points)
      .map((p) => p.trim())
      .filter(Boolean);
    if (points.length) decisions.push({ area: decision.area as AiDecision['area'], points });
  }

  const spellNotes: AiSpellNote[] = [];
  for (const entry of Array.isArray(record.spellNotes) ? record.spellNotes : []) {
    const note = asRecord(entry);
    if (!note || typeof note.spell !== 'string' || typeof note.reason !== 'string') continue;
    if (note.spell.trim() && note.reason.trim())
      spellNotes.push({ spell: note.spell.trim(), reason: note.reason.trim() });
  }

  return { decisions, spellNotes };
};

/**
 * Persists the wizard interaction that produced a sheet, linked to it.
 *
 * Called from the sheet save, which is the first moment the two halves exist at once: the run lives
 * in {@link GenerationRunStore} until then, and the sheet id only exists after the insert. Failures
 * are swallowed on purpose: this is a log, and losing it must never cost the user their character.
 */
@Injectable()
export class GenerationRunService {
  private readonly logger = new Logger(GenerationRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: GenerationRunStore
  ) {}

  async linkToSheet(params: {
    generationId: string | undefined;
    userId: string;
    characterSheetId: string;
  }): Promise<void> {
    if (!params.generationId) return;
    const run = this.store.take(params.generationId, params.userId);
    if (!run) return;

    // Questions and answers are stored paired: the answer is meaningless without the question that
    // produced it, and the wizard matches them by question text, not by index.
    const answerByQuestion = new Map(
      run.answers.map((a) => [a.question.trim().toLowerCase(), a.answer])
    );
    const questions = run.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      answer: answerByQuestion.get(q.question.trim().toLowerCase()) ?? null,
    }));

    try {
      await this.prisma.generationRun.create({
        data: {
          userId: run.userId,
          packId: run.packId,
          characterSheetId: params.characterSheetId,
          prompt: run.prompt,
          note: run.note,
          questions: questions as unknown as Prisma.InputJsonValue,
          meta: (run.meta ?? {}) as unknown as Prisma.InputJsonValue,
          model: run.model,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist generation run for sheet ${params.characterSheetId}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  /** Whether a sheet was produced by the wizard, which is what decides if it offers its AI notes. */
  async existsForSheet(characterSheetId: string): Promise<boolean> {
    const run = await this.prisma.generationRun.findUnique({
      where: { characterSheetId },
      select: { id: true },
    });
    return run !== null;
  }

  /**
   * The justification half of a sheet's log. A sheet with no run, or one whose run expired before
   * the save, reads as empty rather than as an error: the notes are a bonus, never the sheet.
   */
  async findNotesForSheet(characterSheetId: string): Promise<SheetAiNotesResponse> {
    const run = await this.prisma.generationRun.findUnique({
      where: { characterSheetId },
      select: { meta: true },
    });
    return run ? parseNotes(run.meta) : EMPTY_NOTES;
  }
}
