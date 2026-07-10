import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@rag/shared";
import { RolesGuard } from "./roles.guard";

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  const build = (required: Role[] | undefined) => {
    const reflector = {
      getAllAndOverride: () => required,
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it("пропускает, если роли не заданы", () => {
    const guard = build(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it("пропускает admin при @Roles(admin)", () => {
    const guard = build([Role.Admin]);
    const ctx = makeContext({ id: "1", email: "a@b.am", role: Role.Admin });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("запрещает client при @Roles(admin)", () => {
    const guard = build([Role.Admin]);
    const ctx = makeContext({ id: "2", email: "c@b.am", role: Role.Client });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("запрещает анонима при @Roles(admin)", () => {
    const guard = build([Role.Admin]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
