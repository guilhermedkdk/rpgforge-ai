import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateCharacterSheetDto {
  @IsUUID()
  packId: string;

  @IsObject()
  data: Record<string, unknown>;

  /** Present only for an AI draft: persists that wizard interaction alongside the sheet. */
  @IsOptional()
  @IsUUID()
  generationId?: string;
}
