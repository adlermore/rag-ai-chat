import { Module } from "@nestjs/common";
import { IngestModule } from "../ingest/ingest.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { LlmService } from "./llm/llm.service";

@Module({
  imports: [IngestModule],
  controllers: [ChatController],
  providers: [ChatService, LlmService],
})
export class ChatModule {}
