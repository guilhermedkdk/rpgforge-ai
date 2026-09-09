import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AdminUserSort } from '@rpgforce-ai/shared';

const SORTS: AdminUserSort[] = ['spend', 'recent', 'sheets', 'created'];

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @HttpCode(HttpStatus.OK)
  async overview(
    @Query('days') days?: string,
    // The browser's own getTimezoneOffset(), so the chart's days are the days on the reader's clock.
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string
  ) {
    return this.adminService.getOverview(
      days ? Number(days) : undefined,
      tzOffsetMinutes ? Number(tzOffsetMinutes) : undefined
    );
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  async users(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string
  ) {
    return this.adminService.getUsers({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      sort: SORTS.includes(sort as AdminUserSort) ? (sort as AdminUserSort) : undefined,
    });
  }
}
