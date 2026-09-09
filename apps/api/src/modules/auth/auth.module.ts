import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { getAccessTokenExpiresIn } from './auth.config';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { OAuthProviderRegistry } from './oauth/providers/oauth-provider.registry';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: getAccessTokenExpiresIn(configService),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    RefreshTokenCleanupService,
    JwtStrategy,
    OAuthService,
    OAuthProviderRegistry,
  ],
  exports: [AuthService, OAuthService, JwtModule, PassportModule],
})
export class AuthModule {}
