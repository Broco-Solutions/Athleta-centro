import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { SocialWorkService } from './social-work.service';
import { CatalogNameDto, SocialWorkOrderDto } from './clinic.dto';

@ApiTags('Clinic Social Work')
@Controller('clinic')
@UseGuards(PermissionsGuard)
export class SocialWorkController {
  constructor(private readonly socialWork: SocialWorkService) {}
  @Get('social-works') @ApiOperation({ operationId: 'listSocialWorks' }) @RequirePermissions('PEOPLE_READ')
  async listCatalog() { return { data: await this.socialWork.listCatalog() }; }
  @Post('social-works') @ApiOperation({ operationId: 'createSocialWork' }) @RequirePermissions('SOCIAL_WORK_CATALOG_MANAGE')
  @ApiBody({ type: CatalogNameDto })
  async createCatalog(@Body() body: CatalogNameDto) { return { data: await this.socialWork.createCatalog(body.name) }; }
  @Patch('social-works/:id/retire') @ApiOperation({ operationId: 'retireSocialWork' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('SOCIAL_WORK_CATALOG_MANAGE')
  async retire(@Param('id') id: string) { return { data: await this.socialWork.retire(id) }; }
  @Get('orders') @ApiOperation({ operationId: 'listSocialWorkOrders' }) @ApiQuery({ name: 'personId', required: true, type: String, format: 'uuid' }) @RequirePermissions('CLINIC_OPERATIONAL_READ')
  async orders(@Query('personId') personId: string) { return { data: await this.socialWork.listOrders(personId) }; }
  @Post('orders') @ApiOperation({ operationId: 'createSocialWorkOrder' }) @RequirePermissions('CLINIC_ORDER_MANAGE')
  @ApiBody({ type: SocialWorkOrderDto })
  async createOrder(@Body() body: SocialWorkOrderDto) { return { data: await this.socialWork.createOrder(body) }; }
}
