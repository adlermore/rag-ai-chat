import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CacheModule } from "../cache/cache.module";
import { IngestModule } from "../ingest/ingest.module";
import { DocumentsController } from "./documents.controller";
import { FilesController } from "./files.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [IngestModule, AuditModule, CacheModule],
  controllers: [DocumentsController, FilesController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
