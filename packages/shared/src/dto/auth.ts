import { z } from "zod";
import type { User } from "../entities.js";

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** Пара токенов + профиль пользователя. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

/** Полезная нагрузка access-токена (JWT claims). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}
