import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedOnly,
  CurrentUser,
  Public,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: 'Log in with email + password; returns a JWT' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(204)
  @AuthenticatedOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out: the current token stops working' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.logout(user);
  }

  @Get('me')
  @AuthenticatedOnly()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Current user, role, effective permission tags and modules',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    const { token: _token, ...profile } = user;
    return profile;
  }
}
