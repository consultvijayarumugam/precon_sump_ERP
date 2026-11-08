import {
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { CurrentUser, Public, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { UpdateFileDto, UploadFileDto } from './dto/files.dto.js';
import { MAX_FILE_BYTES, type UploadedBytes } from './file-types.js';
import { CATEGORY_LABELS, FilesService, publicBase } from './files.service.js';

/** One file per upload, held in memory (10 MB cap) so its bytes can be checked before anything is written. */
@Injectable()
class LibraryUploadInterceptor extends FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 } }) {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new PayloadTooLargeException('That file is larger than 10 MB, the limit per file.');
      throw error;
    }
  }
}

@ApiTags('crm: file library')
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('files')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'The file library (brochures, price lists, images), each with its public link' })
  list(@Req() req: Request) {
    return this.files.list(publicBase(req));
  }

  @Get('files/categories')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Categories files can be filed under' })
  categories() {
    return Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }));
  }

  @Post('files')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  @UseInterceptors(LibraryUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title'],
      properties: { file: { type: 'string', format: 'binary' }, title: { type: 'string' }, category: { type: 'string', enum: Object.keys(CATEGORY_LABELS) } },
    },
  })
  @ApiOperation({ summary: 'Upload a PDF, JPG or PNG (max 10 MB); the type is checked from the file contents' })
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: UploadedBytes | undefined, @Body() dto: UploadFileDto, @Req() req: Request) {
    return this.files.upload(file, dto, user.id, publicBase(req));
  }

  @Patch('files/:id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  @ApiOperation({ summary: 'Rename or re-categorise a file (its link stays the same)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFileDto, @Req() req: Request) {
    return this.files.update(id, dto, publicBase(req));
  }

  @Delete('files/:id')
  @HttpCode(204)
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  @ApiOperation({ summary: 'Delete a file; its link stops working (lead history keeps the name)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.files.delete(id);
  }

  /** The public link sent to customers on WhatsApp: no login, the long random token is the key. */
  @Get(['f/:token', 'f/:token/:name'])
  @Public()
  @ApiOperation({ summary: 'Public link to a library file (opens in the browser)' })
  async serve(@Param('token') token: string, @Res() res: Response) {
    const { file, absolutePath, downloadName } = await this.files.forToken(token);
    if (!existsSync(absolutePath)) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.sendFile(absolutePath);
  }
}
