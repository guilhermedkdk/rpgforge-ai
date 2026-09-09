import { IsBoolean } from 'class-validator';

export class SetSheetVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
