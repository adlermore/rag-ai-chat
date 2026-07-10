import { SetMetadata } from "@nestjs/common";
import type { Role } from "@rag/shared";

/** Ограничение доступа по ролям. Проверяется RolesGuard. */
export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
