import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessControlModule } from './access-control/access-control.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CrmModule } from './crm/crm.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ServiceModule } from './service/service.module.js';
import { StockModule } from './stock/stock.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    CrmModule,
    FinanceModule,
    StockModule,
    ServiceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
