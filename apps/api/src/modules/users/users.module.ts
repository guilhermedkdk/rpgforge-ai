import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterSheetsModule } from '../character-sheets/character-sheets.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** Accounts as the app's users see them: the public profile, and the settings they can change. */
@Module({
  imports: [AuthModule, CharacterSheetsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
