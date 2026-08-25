import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PeopleService } from '../src/people/people.service';
import { type CreatePersonDto, PersonCreationContext } from '../src/people/person.dto';
import { PrismaService } from '../src/prisma/prisma.service';

describe('People PostgreSQL persistence', () => {
  let prisma: PrismaService; let people: PeopleService;
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); prisma = module.get(PrismaService); people = module.get(PeopleService); });
  beforeEach(() => prisma.person.deleteMany());
  afterAll(() => prisma.$disconnect());
  const input = (dni = '12.345.678'): CreatePersonDto => ({ context: PersonCreationContext.SALA, firstName: 'Persona', lastName: 'Sintética', dni, phone: '3515550101', birthDate: '1991-07-15', email: ' PERSON@Example.test ' });

  it('persists normalized identity, optional email and DATE without timezone drift', async () => {
    const created = await people.create(input());
    const stored = await prisma.person.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({ normalizedDni: '12345678', normalizedEmail: 'person@example.test' });
    expect(created.birthDate).toBe('1991-07-15');
    expect(stored.birthDate.toISOString().slice(0, 10)).toBe('1991-07-15');
  });

  it('enforces normalized DNI uniqueness directly in PostgreSQL', async () => {
    await people.create(input());
    await expect(prisma.person.create({ data: { firstName: 'Otra', lastName: 'Persona', dni: '12345678', normalizedDni: '12345678', phone: '1', birthDate: new Date('1990-01-01T00:00:00Z') } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('resolves concurrent equivalent DNI creation as one success and one controlled conflict', async () => {
    const results = await Promise.allSettled([people.create(input('12.345.678')), people.create(input('12345678'))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejection?.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.person.count({ where: { normalizedDni: '12345678' } })).toBe(1);
  });

  it('searches by normalized DNI and name with stable pagination', async () => {
    await people.create(input());
    const second = input('87654321'); delete second.email;
    await people.create({ ...second, firstName: 'Buscar', lastName: 'Nombre' });
    expect((await people.list({ search: '12.345', page: 1, pageSize: 25 })).data).toHaveLength(1);
    const byName = await people.list({ search: 'buscar', page: 1, pageSize: 1 });
    expect(byName.data[0]?.firstName).toBe('Buscar'); expect(byName.meta).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('rejects structurally invalid normalized DNI through a real CHECK constraint', async () => {
    await expect(prisma.$executeRawUnsafe(`INSERT INTO people (first_name,last_name,dni,normalized_dni,phone,birth_date,updated_at) VALUES ('A','B','x','','1','2000-01-01',now())`)).rejects.toBeDefined();
  });
});
