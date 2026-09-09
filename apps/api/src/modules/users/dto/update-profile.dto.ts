import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { OAUTH_PROVIDER_IDS, PROFILE_AVATAR_IDS, providerAvatarValue } from '@rpgforce-ai/shared';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from '../username';

export class UpdateProfileDto {
  /** Empty string clears it, and the handle takes over as the displayed name. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  @Matches(USERNAME_PATTERN, {
    message: 'O nome de usuário aceita letras minúsculas, números e hífen entre eles.',
  })
  username?: string;

  /**
   * The avatar choice: a gallery id, `provider:<id>`, or an empty string for the initials.
   *
   * Shape only. That the provider is actually LINKED is the service's job, since this layer cannot
   * see the account.
   */
  @IsOptional()
  @IsString()
  @IsIn(['', ...PROFILE_AVATAR_IDS, ...OAUTH_PROVIDER_IDS.map(providerAvatarValue)], {
    message: 'Avatar inválido.',
  })
  avatarId?: string;
}
