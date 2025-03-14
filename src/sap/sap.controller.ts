import { Controller, Post, Param } from '@nestjs/common';
import { SapService } from './sap.service';

@Controller('sap')
export class SapController {
  constructor(private readonly sapService: SapService) {}

  @Post('login/:companyDb') // 📌 Ahora la empresa va en la URL
  async login(@Param('companyDb') companyDb: string) {
    return this.sapService.login(companyDb);
  }

  @Post('logout')
  async logout() {
    return this.sapService.logout();
  }
}
