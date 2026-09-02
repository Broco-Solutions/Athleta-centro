import { Injectable } from '@nestjs/common';
import { InternalUserStatus, Role } from '@prisma/client';
import { ClinicService } from '../clinic/clinic.service';
import { InternalUserService } from '../team/internal-user.service';
import { SalaService } from '../sala/sala.service';

const professionalRoles = new Set<Role>([Role.PROFESSOR, Role.KINESIOLOGIST, Role.OSTEOPATH]);
const discipline = (roles: Role[]): string => roles.includes(Role.KINESIOLOGIST) ? 'Kinesiólogo' : roles.includes(Role.OSTEOPATH) ? 'Osteópata' : roles.includes(Role.PROFESSOR) ? 'Profesor' : 'Profesional';
const time = (value: Date): string => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
const dateAt = (date: string, hour: number): string => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-03:00`).toISOString();
const nextDate = (date: string): string => { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); };

@Injectable()
export class ReservationsService {
  constructor(private readonly sala: SalaService, private readonly clinic: ClinicService, private readonly users: InternalUserService) {}

  async list(date: string) {
    const [salaGroups, appointments, users] = await Promise.all([this.sala.agenda(date), this.clinic.list(dateAt(date, 0), dateAt(nextDate(date), 0)), this.users.list()]);
    const activeProfessionals = users.filter((user) => user.status === InternalUserStatus.ACTIVE && user.roles.some((entry) => professionalRoles.has(entry.role)));
    const salaBookings = salaGroups.flatMap((group) => group.people.map((entry) => ({ id: `${group.slot.id}:${entry.personId}`, source: 'SALA' as const, person: entry.person, startTime: entry.startTime ?? group.slot.startTime, durationMinutes: entry.durationMinutes ?? 15, serviceName: entry.service?.name ?? 'Sala', status: entry.status, origin: entry.origin, professional: null, scheduleSlotId: group.slot.scheduleSlotId ?? group.slot.id })));
    const clinicBookings = appointments.map((appointment) => ({ id: appointment.id, source: 'CLINIC' as const, person: appointment.person, startTime: time(appointment.startAt), durationMinutes: appointment.durationMinutes, serviceName: appointment.serviceType?.name ?? 'Servicio clínico', status: appointment.status, origin: 'APPOINTMENT', professional: { ...appointment.professional, discipline: discipline(users.find((user) => user.id === appointment.professional.id)?.roles.map((entry) => entry.role) ?? []) } }));
    const bookings = [...salaBookings, ...clinicBookings];
    const salaRow = { kind: 'SALA' as const, professional: null, bookings: salaBookings };
    const professionalRows = activeProfessionals.filter((user) => user.roles.some((entry) => professionalRoles.has(entry.role))).map((user) => ({ kind: 'PROFESSIONAL' as const, professional: { id: user.id, firstName: user.firstName, lastName: user.lastName, discipline: discipline(user.roles.map((entry) => entry.role)) }, bookings: clinicBookings.filter((booking) => booking.professional?.id === user.id) }));
    const allTimes = salaGroups.map((group) => { const [hour = 0, minute = 0] = group.slot.startTime.split(':').map(Number); return hour * 60 + minute; }).concat(bookings.map((booking) => { const [hour = 0, minute = 0] = booking.startTime.split(':').map(Number); return hour * 60 + minute; }));
    const starts = allTimes;
    const startMinutes = starts.length ? Math.min(...starts) : 8 * 60;
    const configuredEnd = salaGroups.length ? Math.max(...salaGroups.map((group) => { const [hour = 0, minute = 0] = group.slot.startTime.split(':').map(Number); return hour * 60 + minute + 15; })) : 20 * 60;
    const bookingEnd = bookings.length ? Math.max(...bookings.map((booking) => { const [hour = 0, minute = 0] = booking.startTime.split(':').map(Number); return hour * 60 + minute + booking.durationMinutes; })) : 0;
    const endMinutes = Math.max(configuredEnd, bookingEnd);
    return { date, startTime: `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:00`, endTime: `${String(Math.ceil(endMinutes / 60)).padStart(2, '0')}:00`, rows: [salaRow, ...professionalRows] };
  }
}
