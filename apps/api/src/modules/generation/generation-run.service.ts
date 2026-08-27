import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import { GenerationRunStore } from './generation-run.store';

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
    private readonly store: GenerationRunStore,
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
      run.answers.map((a) => [a.question.trim().toLowerCase(), a.answer]),
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
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
