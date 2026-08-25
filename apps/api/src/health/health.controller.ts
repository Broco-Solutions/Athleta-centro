import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Infrastructure')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ operationId: 'healthCheck', summary: 'Check API liveness' })
  check(): { status: 'ok' } { return { status: 'ok' }; }
}
