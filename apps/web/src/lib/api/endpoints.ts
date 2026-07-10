import type {
  CreateClientRequest,
  LoginResponse,
  Paginated,
  UpdateClientRequest,
  User,
} from "@rag/shared";
import { apiFetch } from "./client";
import { tokenStorage } from "@/lib/auth/storage";

/** Типизированные вызовы API (контракт — из @rag/shared). */
export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    tokenStorage.set(res);
    return res;
  },
  me(): Promise<User> {
    return apiFetch<User>("/auth/me");
  },
};

export const clientsApi = {
  list(page = 1, pageSize = 20): Promise<Paginated<User>> {
    return apiFetch<Paginated<User>>(
      `/admin/clients?page=${page}&pageSize=${pageSize}`,
    );
  },
  create(body: CreateClientRequest): Promise<User> {
    return apiFetch<User>("/admin/clients", { method: "POST", body });
  },
  update(id: string, body: UpdateClientRequest): Promise<User> {
    return apiFetch<User>(`/admin/clients/${id}`, { method: "PATCH", body });
  },
};
