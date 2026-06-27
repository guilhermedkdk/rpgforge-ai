import { IsObject, IsUUID } from 'class-validator';

export class CreateCharacterSheetDto {
  @IsUUID()
  packId: string;

  @IsObject()
  data: Record<string, unknown>;
}
