import { IsObject } from 'class-validator';

export class UpdateCharacterSheetDto {
  @IsObject()
  data: Record<string, unknown>;
}
