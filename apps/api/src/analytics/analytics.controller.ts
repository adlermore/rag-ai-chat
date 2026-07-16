import { Controller, Get, Header, Query } from "@nestjs/common";
import { Role, paginationQuerySchema, type PaginationQuery } from "@rag/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";

/** Аналитика и аудит-журнал. Только admin (docs/02-ARCHITECTURE.md §API). */
@Controller("admin")
@Roles(Role.Admin)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("analytics/dashboard")
  dashboard() {
    return this.analytics.dashboard();
  }

  @Get("analytics/questions")
  questions() {
    return this.analytics.popularQuestions();
  }

  @Get("analytics/questions/export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="questions.csv"')
  exportCsv() {
    return this.analytics.questionsCsv();
  }

  @Get("audit")
  audit(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.analytics.audit(query.page, query.pageSize);
  }
}
