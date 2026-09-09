import { IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  /** Required when the account has a password. */
  @IsOptional()
  @IsString()
  password?: string;

  /**
   * Required when it does not: an account that only ever signed in through a provider has no
   * password to type, so typing the handle is what makes the deletion deliberate.
   */
  @IsOptional()
  @IsString()
  confirmUsername?: string;
}
