import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import {
  loginRequestSchema,
  refreshRequestSchema,
  type LoginRequest,
  type RefreshRequest,
} from "@rag/shared";
import { Public } from "../common/decorators/public.decorator";
import {
  CurrentUser,
  type AuthUser,
} from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ) {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
  ) {
    return this.auth.refresh(body.refreshToken);
  }

  /** Текущий профиль по access-токену. */
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
