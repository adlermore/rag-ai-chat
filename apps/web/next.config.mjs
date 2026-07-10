import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Внутренние пакеты монорепо транспилируются Next напрямую (без пре-билда).
  transpilePackages: ["@rag/shared", "@rag/ui"],
  // Корень монорепо для трейсинга файлов (гасит предупреждение о нескольких lockfile).
  outputFileTracingRoot: join(__dirname, "../../"),
};

export default nextConfig;
