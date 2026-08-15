import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@cmc/core';

export type PermissionCheck = {
  action: string;
  resource: string;
  field?: string;
  filter?: Record<string, unknown>;
};

export function authorize(check: PermissionCheck) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    // Super admin bypass
    if (req.user.isSuperAdmin) {
      return next();
    }

    // Check user permissions from JWT (populated at login)
    const userPermissions = (req.user as Record<string, unknown>).permissions as string[] | undefined;

    if (!userPermissions || userPermissions.length === 0) {
      return next(new ForbiddenError(`Missing permission: ${check.action}:${check.resource}`));
    }

    // Check if any permission matches
    const hasPermission = userPermissions.some((perm) => {
      const [action, ...resourceParts] = perm.split(':');
      const resource = resourceParts.join(':');
      return (
        action === check.action &&
        (resource === check.resource || resource === '*' || action === '*')
      );
    });

    if (!hasPermission) {
      return next(new ForbiddenError(`Missing permission: ${check.action}:${check.resource}`));
    }

    next();
  };
}

// Quick permission check helper (for use in service layer)
export function checkUserPermission(
  userPermissions: string[],
  action: string,
  resource: string
): boolean {
  return userPermissions.some((perm) => {
    const [permAction, ...permResourceParts] = perm.split(':');
    const permResource = permResourceParts.join(':');
    return (
      (permAction === action || permAction === '*') &&
      (permResource === resource || permResource === '*')
    );
  });
}