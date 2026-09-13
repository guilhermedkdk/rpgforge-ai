import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  // The token came from the link, so its shape is ours: only emptiness is worth rejecting here,
  // and the lookup decides the rest.
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
