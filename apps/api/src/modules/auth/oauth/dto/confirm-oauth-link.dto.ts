import { IsString, MinLength } from 'class-validator';

export class ConfirmOAuthLinkDto {
  // Which provider identity is being linked comes from the signed cookie, never from the body.
  @IsString()
  @MinLength(1)
  password: string;
}
