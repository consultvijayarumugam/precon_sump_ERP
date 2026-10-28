import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OPERATIONS_FEATURE_KEY, operationsEnabled } from './features.js';

/** Answers 404 for operations routes while OPERATIONS_ENABLED is off, whoever asks (admin too). */
@Injectable()
export class OperationsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isOperations = this.reflector.getAllAndOverride<boolean>(OPERATIONS_FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (isOperations && !operationsEnabled()) {
      throw new NotFoundException('This module is switched off (OPERATIONS_ENABLED is not set). The live product is the sales and telecaller CRM.');
    }
    return true;
  }
}
