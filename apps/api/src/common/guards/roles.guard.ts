import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@rag/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthUser } from "../decorators/current-user.decorator";

/** RBAC: пропускает, только если роль пользователя входит в @Roles(...). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    if (!user || !required.includes(user.role as Role)) {
      throw new ForbiddenException("Անբավարար իրավունքներ");
    }
    return true;
  }
}
