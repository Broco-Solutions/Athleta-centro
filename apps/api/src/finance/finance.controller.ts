import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { UseGuards } from '@nestjs/common';
import { FinanceCatalogService } from './finance.service';
class PaymentMethodInput { @IsString() @MinLength(1) name!: string; @IsOptional() @IsBoolean() isSelectable?: boolean; }
@ApiTags('Finance') @Controller('finance/payment-methods') @UseGuards(PermissionsGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceCatalogService) {}
  @Get() @RequirePermissions('SALA_PAYMENT_READ') @ApiOperation({ operationId: 'listPaymentMethods' }) list() { return { data: this.finance.listAll() }; }
  @Post() @RequirePermissions('PAYMENT_METHOD_CATALOG_MANAGE') @ApiOperation({ operationId: 'createPaymentMethod' }) @ApiBody({ type: PaymentMethodInput }) create(@Body() body: PaymentMethodInput) { return { data: this.finance.create(body.name) }; }
  @Patch(':id') @RequirePermissions('PAYMENT_METHOD_CATALOG_MANAGE') @ApiParam({ name: 'id', type: String }) @ApiOperation({ operationId: 'updatePaymentMethod' }) @ApiBody({ type: PaymentMethodInput }) update(@Param('id') id: string, @Body() body: PaymentMethodInput) { return { data: this.finance.update(id, body.name, body.isSelectable) }; }
}
