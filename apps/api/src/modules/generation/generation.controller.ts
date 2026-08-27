import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { GenerateCharacterDto } from './dto/generate-character.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';

type RequestUser = { id: string; email: string; createdAt: Date };

@Controller('generation')
@UseGuards(JwtAuthGuard)
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('questions')
  @HttpCode(HttpStatus.OK)
  async questions(@CurrentUser() user: RequestUser, @Body() body: GenerateQuestionsDto) {
    return this.generationService.generateQuestions(user.id, body.packId, body.prompt);
  }

  @Post('character')
  @HttpCode(HttpStatus.OK)
  async character(@CurrentUser() user: RequestUser, @Body() body: GenerateCharacterDto) {
    return this.generationService.generateCharacter({
      packId: body.packId,
      prompt: body.prompt,
      answers: body.answers,
      generationId: body.generationId,
    });
  }
}
