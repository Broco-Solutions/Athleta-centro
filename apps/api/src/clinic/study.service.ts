import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrivateStorageService } from '../files/private-storage.service';
import { PrismaService } from '../prisma/prisma.service';

const publicFileSelect = { id: true, originalName: true, mimeType: true, size: true, createdAt: true } as const;

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService, private readonly storage: PrivateStorageService) {}

  async create(body: Record<string, unknown>) {
    const personId = String(body.personId);
    const studyType = String(body.studyType ?? '').trim();
    const studyDate = this.date(String(body.studyDate));
    if (!studyType) throw new BadRequestException({ code: 'STUDY_TYPE_REQUIRED', message: 'Study type required' });
    const treatmentId = body.treatmentId ? String(body.treatmentId) : null;
    await this.validateTreatment(personId, treatmentId);
    return this.prisma.clinicalStudy.create({ data: { personId, studyType, studyDate, treatmentId, description: body.description ? String(body.description).trim() : null } });
  }

  list(personId?: string) {
    return this.prisma.clinicalStudy.findMany({ ...(personId ? { where: { personId } } : {}), orderBy: [{ studyDate: 'desc' }, { createdAt: 'desc' }], include: { fileAsset: { select: publicFileSelect } } });
  }

  async detail(id: string) {
    const study = await this.prisma.clinicalStudy.findUnique({ where: { id }, include: { fileAsset: { select: publicFileSelect } } });
    if (!study) throw new NotFoundException({ code: 'STUDY_NOT_FOUND', message: 'Study not found' });
    return study;
  }

  async update(id: string, body: Record<string, unknown>) {
    const current = await this.prisma.clinicalStudy.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'STUDY_NOT_FOUND', message: 'Study not found' });
    const treatmentId = body.treatmentId === null ? null : body.treatmentId ? String(body.treatmentId) : current.treatmentId;
    await this.validateTreatment(current.personId, treatmentId);
    const studyType = body.studyType === undefined ? current.studyType : String(body.studyType).trim();
    if (!studyType) throw new BadRequestException({ code: 'STUDY_TYPE_REQUIRED', message: 'Study type required' });
    return this.prisma.clinicalStudy.update({ where: { id }, data: { studyType, treatmentId, studyDate: body.studyDate === undefined ? current.studyDate : this.date(String(body.studyDate)), description: body.description === undefined ? current.description : String(body.description).trim() || null } });
  }

  async attach(id: string, actorId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'CLINICAL_FILE_REQUIRED', message: 'File is required' });
    this.validateFile(file);
    const study = await this.prisma.clinicalStudy.findUnique({ where: { id }, include: { fileAsset: true } });
    if (!study) throw new NotFoundException({ code: 'STUDY_NOT_FOUND', message: 'Study not found' });
    const storageKey = this.storage.key();
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    try {
      const asset = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.fileAsset.create({ data: { storageKey, originalName: file.originalname, mimeType: file.mimetype, size: file.size, checksum: createHash('sha256').update(file.buffer).digest('hex'), createdById: actorId } });
        await transaction.clinicalStudy.update({ where: { id }, data: { fileAssetId: created.id } });
        return created;
      });
      if (study.fileAsset) await this.cleanupPrevious(study.fileAsset.id, study.fileAsset.storageKey);
      return { id: asset.id, originalName: asset.originalName, mimeType: asset.mimeType, size: asset.size };
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async removeFile(id: string) {
    const study = await this.prisma.clinicalStudy.findUnique({ where: { id }, include: { fileAsset: true } });
    if (!study) throw new NotFoundException({ code: 'STUDY_NOT_FOUND', message: 'Study not found' });
    if (!study.fileAsset) return null;
    await this.prisma.clinicalStudy.update({ where: { id }, data: { fileAssetId: null } });
    await this.cleanupPrevious(study.fileAsset.id, study.fileAsset.storageKey);
    return null;
  }

  async access(id: string) {
    const study = await this.prisma.clinicalStudy.findUnique({ where: { id }, include: { fileAsset: true } });
    if (!study?.fileAsset) throw new NotFoundException({ code: 'STUDY_FILE_NOT_FOUND', message: 'Study file not found' });
    return { url: await this.storage.access(study.fileAsset.storageKey), expiresInSeconds: 300 };
  }

  private date(value: string) { const result = new Date(`${value}T00:00:00Z`); if (Number.isNaN(result.getTime())) throw new BadRequestException({ code: 'STUDY_DATE_INVALID', message: 'Invalid date' }); return result; }
  private async validateTreatment(personId: string, treatmentId: string | null) { if (!treatmentId) return; const treatment = await this.prisma.treatment.findUnique({ where: { id: treatmentId } }); if (!treatment || treatment.personId !== personId) throw new BadRequestException({ code: 'STUDY_TREATMENT_INVALID', message: 'Treatment does not belong to person' }); }
  private validateFile(file: Express.Multer.File) { const pdf = file.buffer.subarray(0, 5).toString() === '%PDF-'; const jpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff; const png = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); const valid = file.mimetype === 'application/pdf' ? pdf : file.mimetype === 'image/jpeg' ? jpeg : file.mimetype === 'image/png' ? png : false; if (!valid) throw new BadRequestException({ code: 'CLINICAL_FILE_INVALID', message: 'Only valid PDF, JPEG or PNG files are allowed' }); }
  private async cleanupPrevious(id: string, storageKey: string) { try { await this.storage.remove(storageKey); await this.prisma.fileAsset.delete({ where: { id } }); } catch { /* DB already references the valid new state; retained metadata enables safe cleanup. */ } }
}
