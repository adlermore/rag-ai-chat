import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface AuditInput {
  adminId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
}

/** Запись действий администратора в таблицу audit_log (CLAUDE.md §8). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        payload: input.payload,
      },
    });
  }
}
