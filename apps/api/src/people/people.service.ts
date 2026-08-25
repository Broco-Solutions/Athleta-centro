import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePersonDto, ListPeopleQueryDto, UpdatePersonDto } from './person.dto';
import { normalizeDni, normalizeEmail } from './person.normalization';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePersonDto) {
    const normalizedDni = normalizeDni(input.dni);
    if (!normalizedDni) throw new ConflictException({ code: 'PERSON_DNI_INVALID', message: 'DNI is invalid' });
    const existing = await this.prisma.person.findUnique({ where: { normalizedDni }, select: { id: true } });
    if (existing) this.duplicateDni();
    try {
      const person = await this.prisma.person.create({ data: this.createData(input, normalizedDni) });
      return this.serialize(person);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.duplicateDni();
      throw error;
    }
  }

  async update(id: string, input: UpdatePersonDto) {
    const current = await this.prisma.person.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    try {
      const person = await this.prisma.person.update({ where: { id }, data: {
        ...(input.firstName !== undefined && { firstName: input.firstName.trim() }),
        ...(input.lastName !== undefined && { lastName: input.lastName.trim() }),
        ...(input.dni !== undefined && { dni: input.dni.trim(), normalizedDni: normalizeDni(input.dni) }),
        ...(input.phone !== undefined && { phone: input.phone.trim() }),
        ...(input.birthDate !== undefined && { birthDate: this.date(input.birthDate) }),
        ...(input.email !== undefined && { email: input.email?.trim() || null, normalizedEmail: normalizeEmail(input.email) }),
        ...(input.emergencyContactName !== undefined && { emergencyContactName: input.emergencyContactName?.trim() || null }),
        ...(input.emergencyContactPhone !== undefined && { emergencyContactPhone: input.emergencyContactPhone?.trim() || null }),
        ...(input.socialWorkId !== undefined && { socialWorkId: input.socialWorkId || null }),
        ...(input.affiliateNumber !== undefined && { affiliateNumber: input.affiliateNumber?.trim() || null }),
      } });
      return this.serialize(person);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.duplicateDni();
      throw error;
    }
  }

  async get(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException({ code: 'PERSON_NOT_FOUND', message: 'Person not found' });
    return this.serialize(person);
  }

  async list(query: ListPeopleQueryDto) {
    const search = query.search?.trim();
    const normalized = search ? normalizeDni(search) : '';
    const where: Prisma.PersonWhereInput = search ? { OR: [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      ...(normalized ? [{ normalizedDni: { contains: normalized } } satisfies Prisma.PersonWhereInput] : []),
    ] } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.person.count({ where }),
    ]);
    return { data: rows.map((person) => this.serialize(person)), meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  private createData(input: CreatePersonDto, normalizedDni: string): Prisma.PersonCreateInput {
    return { firstName: input.firstName.trim(), lastName: input.lastName.trim(), dni: input.dni.trim(), normalizedDni, phone: input.phone.trim(), birthDate: this.date(input.birthDate), email: input.email?.trim() || null, normalizedEmail: normalizeEmail(input.email), emergencyContactName: input.emergencyContactName?.trim() || null, emergencyContactPhone: input.emergencyContactPhone?.trim() || null, socialWorkId: input.socialWorkId ?? null, affiliateNumber: input.affiliateNumber?.trim() || null };
  }
  private date(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
  private serialize(person: { id: string; firstName: string; lastName: string; dni: string; phone: string; birthDate: Date; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; socialWorkId: string | null; affiliateNumber: string | null }) {
    return { id: person.id, firstName: person.firstName, lastName: person.lastName, dni: person.dni, phone: person.phone, birthDate: person.birthDate.toISOString().slice(0, 10), email: person.email, emergencyContactName: person.emergencyContactName, emergencyContactPhone: person.emergencyContactPhone, socialWorkId: person.socialWorkId, affiliateNumber: person.affiliateNumber, status: 'INACTIVE' as const, contexts: [] as string[] };
  }
  private duplicateDni(): never { throw new ConflictException({ code: 'PERSON_DNI_ALREADY_EXISTS', message: 'A person with this DNI already exists' }); }
}
