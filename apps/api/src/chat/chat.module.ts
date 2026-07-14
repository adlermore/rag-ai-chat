import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { IngestModule } from "../ingest/ingest.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { LlmService } from "./llm/llm.service";

@Module({
  imports: [IngestModule, CacheModule],
  controllers: [ChatController],
  providers: [ChatService, LlmService],
})
export class ChatModule {}
