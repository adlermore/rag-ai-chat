import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodError, ZodSchema } from "zod";

/**
 * Валидация входа Zod-схемами из @rag/shared. Используется точечно:
 * @Body(new ZodValidationPipe(loginRequestSchema)).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          code: "validation.failed",
          message: "Սխալ մուտքային տվյալներ",
          issues: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }
      throw err;
    }
  }
}
