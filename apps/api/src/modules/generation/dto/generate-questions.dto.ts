import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class GenerateQuestionsDto {
  @IsUUID()
  packId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt!: string;
}
