import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayload } from "@rag/shared";
import type { AuthUser } from "../common/decorators/current-user.decorator";
import { UsersService } from "../users/users.service";

/** Проверка access-JWT: подпись + существование и активность пользователя. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || user.status === "blocked") {
      throw new UnauthorizedException({
        code: "auth.invalid_token",
        message: "Անվավեր նույնականացում",
      });
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
