import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { PacksModule } from './modules/packs/packs.module';
import { RuleitemsModule } from './modules/ruleitems/ruleitems.module';
import { CharacterSheetsModule } from './modules/character-sheets/character-sheets.module';
import { PrismaService } from './shared/prisma.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    PacksModule,
    RuleitemsModule,
    CharacterSheetsModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}