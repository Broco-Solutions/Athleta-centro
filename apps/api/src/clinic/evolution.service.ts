import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Input = { evolutionText?: string; practicesOrManeuvers?: string; indicationsOrNextSteps?: string };

@Injectable()
export class EvolutionService {
  constructor(private readonly prisma: PrismaService) {}

  private hasContent(input: Input) {
    return [input.evolutionText, input.practicesOrManeuvers, input.indicationsOrNextSteps].some((value) => Boolean(value?.trim()));
  }

  async create(attentionId: string, authorId: string, input: Input) {
    if (!this.hasContent(input)) throw new BadRequestException({ code: 'EVOLUTION_CONTENT_REQUIRED', message: 'At least one field is required' });
    const attention = await this.prisma.clinicalAttention.findUnique({ where: { id: attentionId }, select: { id: true } });
    if (!attention) throw new NotFoundException({ code: 'ATTENTION_NOT_FOUND', message: 'Attention not found' });
    try {
      return await this.prisma.evolution.create({ data: {
        attentionId,
        authorId,
        ...this.content(input),
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'EVOLUTION_ALREADY_EXISTS', message: 'An attention can only have one evolution' });
      }
      throw error;
    }
  }

  get(attentionId: string) { return this.prisma.evolution.findUnique({ where: { attentionId } }); }

  async update(id: string, modifierId: string, input: Input) {
    if (!this.hasContent(input)) throw new BadRequestException({ code: 'EVOLUTION_CONTENT_REQUIRED', message: 'At least one field is required' });
    const current = await this.prisma.evolution.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundException({ code: 'EVOLUTION_NOT_FOUND', message: 'Evolution not found' });
    return this.prisma.evolution.update({
      where: { id },
      data: { ...this.content(input), lastModifiedById: modifierId, lastModifiedAt: new Date() },
    });
  }

  private content(input: Input) {
    return {
      evolutionText: input.evolutionText?.trim() || null,
      practicesOrManeuvers: input.practicesOrManeuvers?.trim() || null,
      indicationsOrNextSteps: input.indicationsOrNextSteps?.trim() || null,
    };
  }
}
