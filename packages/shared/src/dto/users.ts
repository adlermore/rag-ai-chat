import { z } from "zod";
import { Role, UserStatus } from "../enums.js";

/**
 * Создание клиента админом. Публичной регистрации нет — учётки заводит только
 * администратор (см. решение Фазы 1). Роль по умолчанию — client.
 */
export const createClientSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum([Role.Admin, Role.Client]).default(Role.Client),
});
export type CreateClientRequest = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  status: z.enum([UserStatus.Active, UserStatus.Blocked]).optional(),
});
export type UpdateClientRequest = z.infer<typeof updateClientSchema>;
