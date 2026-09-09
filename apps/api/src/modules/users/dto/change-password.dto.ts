import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  /**
   * Proves it is the account's owner sitting there, not a borrowed session.
   *
   * Optional at this layer only because an account that has never had a password cannot supply one;
   * the service still requires it whenever a password exists, and rejects it when one does not.
   */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
