import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EvalController } from "./eval.controller";
import { EvalService } from "./eval.service";

@Module({
  imports: [AuditModule],
  controllers: [EvalController],
  providers: [EvalService],
})
export class EvalModule {}
