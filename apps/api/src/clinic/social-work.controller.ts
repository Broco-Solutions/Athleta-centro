import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { SocialWorkService } from './social-work.service';

@ApiTags('Clinic Social Work')
@Controller('clinic')
@UseGuards(PermissionsGuard)
export class SocialWorkController {
  constructor(private readonly socialWork: SocialWorkService) {}
  @Get('social-works') @ApiOperation({ operationId: 'listSocialWorks' }) @RequirePermissions('CLINIC_OPERATIONAL_READ')
  listCatalog() { return { data: this.socialWork.listCatalog() }; }
  @Post('social-works') @ApiOperation({ operationId: 'createSocialWork' }) @RequirePermissions('CLINIC_ORDER_MANAGE')
  async createCatalog(@Body() body: { name: string }) { return { data: await this.socialWork.createCatalog(body.name) }; }
  @Patch('social-works/:id/retire') @ApiOperation({ operationId: 'retireSocialWork' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('CLINIC_ORDER_MANAGE')
  async retire(@Param('id') id: string) { return { data: await this.socialWork.retire(id) }; }
  @Get('orders') @ApiOperation({ operationId: 'listSocialWorkOrders' }) @RequirePermissions('CLINIC_OPERATIONAL_READ')
  async orders(@Query('personId') personId: string) { return { data: await this.socialWork.listOrders(personId) }; }
  @Post('orders') @ApiOperation({ operationId: 'createSocialWorkOrder' }) @RequirePermissions('CLINIC_ORDER_MANAGE')
  async createOrder(@Body() body: Record<string, unknown>) { return { data: await this.socialWork.createOrder(body as never) }; }
}
