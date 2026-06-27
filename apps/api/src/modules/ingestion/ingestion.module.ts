import { Module } from '@nestjs/common';
import { Open5eIngestionService } from './open5e/open5e-ingestion.service';

@Module({
  providers: [Open5eIngestionService],
  exports: [Open5eIngestionService],
})
export class IngestionModule {}
