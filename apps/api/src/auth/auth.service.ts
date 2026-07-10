import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { LoginResponse, AuthTokens, JwtPayload } from "@rag/shared";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private readonly invalidCreds = new UnauthorizedException({
    code: "auth.invalid_credentials",
    message: "Սխալ էլ. հասցե կամ գաղտնաբառ",
  });

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw this.invalidCreds;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw this.invalidCreds;
    }
    if (user.status === "blocked") {
      throw new UnauthorizedException({
        code: "auth.blocked",
        message: "Ձեր հաշիվն արգելափակված է",
      });
    }

    const tokens = await this.signTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { ...tokens, user: UsersService.toEntity(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException({
        code: "auth.invalid_refresh",
        message: "Սեսիան լրացել է։ Մուտք գործեք կրկին",
      });
    }
    const user = await this.users.findById(payload.sub);
    if (!user || user.status === "blocked") {
      throw new UnauthorizedException({
        code: "auth.invalid_refresh",
        message: "Սեսիան անվավեր է",
      });
    }
    return this.signTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private async signTokens(payload: JwtPayload): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "15m"),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_TTL", "7d"),
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
