import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@rpgforce-ai/shared';
import { GenerationService } from './generation.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { GenerateCharacterDto } from './dto/generate-character.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GENERATION_THROTTLE } from '../../shared/throttling/throttle-tiers';

@Controller('generation')
@UseGuards(JwtAuthGuard)
@Throttle(GENERATION_THROTTLE)
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('questions')
  @HttpCode(HttpStatus.OK)
  async questions(@CurrentUser() user: User, @Body() body: GenerateQuestionsDto) {
    return this.generationService.generateQuestions(user.id, body.packId, body.prompt);
  }

  @Post('character')
  @HttpCode(HttpStatus.OK)
  async character(@CurrentUser() user: User, @Body() body: GenerateCharacterDto) {
    return this.generationService.generateCharacter({
      userId: user.id,
      packId: body.packId,
      prompt: body.prompt,
      answers: body.answers,
      generationId: body.generationId,
    });
  }
}
