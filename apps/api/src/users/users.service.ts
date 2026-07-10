import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { User as UserEntity } from "@rag/shared";
import type {
  CreateClientRequest,
  UpdateClientRequest,
  Paginated,
} from "@rag/shared";
import { Prisma, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Публичная форма пользователя (без password_hash). */
  static toEntity(u: User): UserEntity {
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
    };
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateClientRequest): Promise<UserEntity> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new ConflictException({
        code: "users.email_taken",
        message: "Այս էլ. հասցեն արդեն գրանցված է",
      });
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash, role: input.role },
    });
    return UsersService.toEntity(user);
  }

  async list(page: number, pageSize: number): Promise<Paginated<UserEntity>> {
    const where: Prisma.UserWhereInput = { role: "client" };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(UsersService.toEntity), total, page, pageSize };
  }

  async update(id: string, input: UpdateClientRequest): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException({
        code: "users.not_found",
        message: "Օգտատերը չի գտնվել",
      });
    }
    const data: Prisma.UserUpdateInput = {};
    if (input.status) {
      data.status = input.status;
    }
    if (input.password) {
      data.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    }
    const updated = await this.prisma.user.update({ where: { id }, data });
    return UsersService.toEntity(updated);
  }
}
