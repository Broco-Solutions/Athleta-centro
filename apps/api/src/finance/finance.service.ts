import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceCatalogService {
  constructor(private readonly prisma: PrismaService) {}
  listSelectable() { return this.prisma.paymentMethod.findMany({ where: { isSelectable: true }, orderBy: { name: 'asc' } }); }
  listAll() { return this.prisma.paymentMethod.findMany({ orderBy: { name: 'asc' } }); }
  create(name: string) { const value = name.trim(); if (!value) throw new BadRequestException({ code: 'PAYMENT_METHOD_NAME_REQUIRED', message: 'Name is required' }); return this.prisma.paymentMethod.create({ data: { name: value } }); }
  async update(id: string, name?: string, isSelectable?: boolean) { if (name !== undefined && !name.trim()) throw new BadRequestException({ code: 'PAYMENT_METHOD_NAME_REQUIRED', message: 'Name is required' }); try { return await this.prisma.paymentMethod.update({ where: { id }, data: { ...(name !== undefined ? { name: name.trim() } : {}), ...(isSelectable !== undefined ? { isSelectable } : {}) } }); } catch { throw new NotFoundException({ code: 'PAYMENT_METHOD_NOT_FOUND', message: 'Payment method not found' }); } }
}
