import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../auth/permissions.guard';
import { StudyService } from './study.service';

@ApiTags('Clinic Studies')
@Controller('clinic/studies')
@UseGuards(PermissionsGuard)
export class StudyController {
  constructor(private readonly studies: StudyService) {}
  private actor(request: { athletaUserId?: string }) { if (!request.athletaUserId) throw new Error('Authenticated actor missing'); return request.athletaUserId; }

  @Post() @ApiOperation({ operationId: 'createClinicalStudy' }) @RequirePermissions('CLINIC_STUDY_MANAGE')
  async create(@Body() body: Record<string, unknown>) { return { data: await this.studies.create(body) }; }
  @Get() @ApiOperation({ operationId: 'listClinicalStudies' }) @RequirePermissions('CLINICAL_HISTORY_READ')
  async list(@Query('personId') personId?: string) { return { data: await this.studies.list(personId) }; }
  @Get(':id') @ApiOperation({ operationId: 'getClinicalStudy' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('CLINICAL_HISTORY_READ')
  async detail(@Param('id') id: string) { return { data: await this.studies.detail(id) }; }
  @Patch(':id') @ApiOperation({ operationId: 'updateClinicalStudy' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('CLINIC_STUDY_MANAGE')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) { return { data: await this.studies.update(id, body) }; }
  @Post(':id/file') @ApiOperation({ operationId: 'attachClinicalStudyFile' }) @ApiParam({ name: 'id', type: String }) @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } })) @RequirePermissions('CLINIC_STUDY_MANAGE')
  async attach(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() request: { athletaUserId?: string }) { return { data: await this.studies.attach(id, this.actor(request), file) }; }
  @Put(':id/file') @ApiOperation({ operationId: 'replaceClinicalStudyFile' }) @ApiParam({ name: 'id', type: String }) @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } })) @RequirePermissions('CLINIC_STUDY_MANAGE')
  async replace(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() request: { athletaUserId?: string }) { return { data: await this.studies.attach(id, this.actor(request), file) }; }
  @Delete(':id/file') @ApiOperation({ operationId: 'removeClinicalStudyFile' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('CLINIC_STUDY_MANAGE')
  async remove(@Param('id') id: string) { return { data: await this.studies.removeFile(id) }; }
  @Get(':id/file/access') @ApiOperation({ operationId: 'getClinicalStudyFileAccess' }) @ApiParam({ name: 'id', type: String }) @RequirePermissions('CLINICAL_HISTORY_READ')
  async access(@Param('id') id: string) { return { data: await this.studies.access(id) }; }
}
