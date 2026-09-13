import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { PacksModule } from './modules/packs/packs.module';
import { RuleitemsModule } from './modules/ruleitems/ruleitems.module';
import { CharacterSheetsModule } from './modules/character-sheets/character-sheets.module';
import { ExportsModule } from './modules/exports/exports.module';
import { UsersModule } from './modules/users/users.module';
import { GenerationModule } from './modules/generation/generation.module';
import { ThrottlingModule } from './shared/throttling/throttling.module';
import { AdminModule } from './modules/admin/admin.module';
import { PrismaService } from './shared/prisma.service';
import { MailService } from './shared/mail/mail.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlingModule,
    AuthModule,
    PacksModule,
    RuleitemsModule,
    CharacterSheetsModule,
    UsersModule,
    AdminModule,
    ExportsModule,
    GenerationModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [PrismaService, MailService],
  exports: [PrismaService, MailService],
})
export class AppModule {}
