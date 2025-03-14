import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulerModule } from './scheduler.module';
import { InvoiceSchedulerService } from './scheduler.service';
import configuration from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    SchedulerModule,
  ],
  providers: [InvoiceSchedulerService],
})
export class ConfigAppModule {}
