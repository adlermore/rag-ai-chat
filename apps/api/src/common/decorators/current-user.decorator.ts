import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Аутентифицированный пользователь, положенный в request стратегией JWT. */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
