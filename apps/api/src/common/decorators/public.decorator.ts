import { SetMetadata } from "@nestjs/common";

/** Метка публичного эндпоинта — JwtAuthGuard его пропускает без токена. */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
