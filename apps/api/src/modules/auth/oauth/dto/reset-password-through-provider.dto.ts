import { IsString, MinLength } from 'class-validator';

export class ResetPasswordThroughProviderDto {
  // Which provider identity proves ownership comes from the signed cookie, never from the body.
  @IsString()
  @MinLength(8)
  newPassword: string;
}
