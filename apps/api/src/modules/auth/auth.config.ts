import { ConfigService } from '@nestjs/config';

const getRequiredSeconds = (configService: ConfigService, key: string): number => {
  const raw = configService.get<string>(key);
  if (!raw) {
    throw new Error(`${key} is required in .env`);
  }
  const val = parseInt(raw, 10);
  if (isNaN(val) || val <= 0) {
    throw new Error(`${key} must be a positive number (seconds)`);
  }
  return val;
};

export const getAccessTokenExpiresIn = (configService: ConfigService): number =>
  getRequiredSeconds(configService, 'JWT_EXPIRES_IN');

export const getRefreshTokenExpiresIn = (configService: ConfigService): number =>
  getRequiredSeconds(configService, 'JWT_REFRESH_EXPIRES_IN');
