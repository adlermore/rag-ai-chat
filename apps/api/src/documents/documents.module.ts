import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CacheModule } from "../cache/cache.module";
import { IngestModule } from "../ingest/ingest.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [IngestModule, AuditModule, CacheModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
