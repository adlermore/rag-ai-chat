import { Module } from "@nestjs/common";
import { IngestClient } from "./ingest.client";

/** HTTP-клиент к Python ingest-сервису; используется documents и chat. */
@Module({
  providers: [IngestClient],
  exports: [IngestClient],
})
export class IngestModule {}
