import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  Role,
  createClientSchema,
  updateClientSchema,
  paginationQuerySchema,
  type CreateClientRequest,
  type UpdateClientRequest,
  type PaginationQuery,
} from "@rag/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "./users.service";

/** Админ-CRUD клиентов. Все эндпоинты — только для роли admin (RolesGuard). */
@Controller("admin/clients")
@Roles(Role.Admin)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.users.list(query.page, query.pageSize);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientRequest,
    @CurrentUser() admin: AuthUser,
  ) {
    const created = await this.users.create(body);
    await this.audit.log({
      adminId: admin.id,
      action: "client.create",
      entity: "user",
      entityId: created.id,
      payload: { email: created.email, role: created.role },
    });
    return created;
  }

  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientRequest,
    @CurrentUser() admin: AuthUser,
  ) {
    const updated = await this.users.update(id, body);
    await this.audit.log({
      adminId: admin.id,
      action: "client.update",
      entity: "user",
      entityId: id,
      payload: { status: body.status, passwordChanged: Boolean(body.password) },
    });
    return updated;
  }
}
