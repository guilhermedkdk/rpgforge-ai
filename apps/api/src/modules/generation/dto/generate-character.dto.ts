import {
  IsBoolean,
  IsString,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  IsUUID,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class GenerationAnswerDto {
  @IsString()
  @MaxLength(500)
  question!: string;

  @IsString()
  @MaxLength(2000)
  answer!: string;

  /** Typed by the user rather than picked from the offered options. */
  @IsOptional()
  @IsBoolean()
  typed?: boolean;
}

export class GenerateCharacterDto {
  @IsUUID()
  packId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenerationAnswerDto)
  answers!: GenerationAnswerDto[];

  /** Id returned by `POST /generation/questions`; links this call to that clarifying round. */
  @IsOptional()
  @IsUUID()
  generationId?: string;
}
