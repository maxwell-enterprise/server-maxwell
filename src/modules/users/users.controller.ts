/**
 * MAXWELL ERP - Users Controller
 */

import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateUserDtoSchema,
  UpdateUserDtoSchema,
  UserQueryDtoSchema,
  UpdateUserRoleDtoSchema,
} from './dto';
import type {
  CreateUserDto,
  UpdateUserDto,
  UserQueryDto,
  UpdateUserRoleDto,
} from './dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/auth.service';
import { assertSuperAdminOnly } from '../../common/security/access-policy';
import {
  parseAppRoleString,
  USER_ROLE,
} from '../workspace-identity/user-role.constants';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new user (Admin only)
   * POST /users
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: JwtUserPayload },
    @Body(new ZodValidationPipe(CreateUserDtoSchema))
    createUserDto: CreateUserDto,
  ) {
    assertSuperAdminOnly(req.user, 'User creation');
    return this.usersService.create(createUserDto);
  }

  /**
   * Get all users with pagination
   * GET /users
   */
  @Get()
  findAll(
    @Query(new ZodValidationPipe(UserQueryDtoSchema)) query: UserQueryDto,
  ) {
    return this.usersService.findAll(query);
  }

  /**
   * Get current user profile
   * GET /users/me
   */
  @Get('me')
  getMe() {
    return { message: 'Not implemented - needs auth' };
  }

  /**
   * Tribe members for the signed-in facilitator (JWT `sub`).
   * GET /users/me/downline
   */
  @Get('me/downline')
  @UseGuards(JwtAuthGuard)
  getMyDownline(@Req() req: { user: JwtUserPayload }) {
    const id = this.requireSessionUserId(req.user);
    return this.usersService.getDownline(id, req.user.email);
  }

  /**
   * Mentoring sessions for the signed-in facilitator.
   * GET /users/me/tribe/sessions
   */
  @Get('me/tribe/sessions')
  @UseGuards(JwtAuthGuard)
  getMyTribeSessions(@Req() req: { user: JwtUserPayload }) {
    const id = this.requireSessionUserId(req.user);
    return this.usersService.getTribeMentoringSessions(id, req.user.email);
  }

  /**
   * Get facilitator's tribe members (CRM downline)
   * GET /users/:id/downline
   */
  @Get(':id/downline')
  @UseGuards(JwtAuthGuard)
  getDownline(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    const facilitatorId = this.normalizeFacilitatorId(id);
    this.assertTribeSelfOrSuperAdmin(req.user, facilitatorId);
    return this.usersService.getDownline(facilitatorId);
  }

  /**
   * Mentoring session logs for My Tribe
   * GET /users/:id/tribe/sessions
   */
  @Get(':id/tribe/sessions')
  @UseGuards(JwtAuthGuard)
  getTribeSessions(
    @Req() req: { user: JwtUserPayload },
    @Param('id') id: string,
  ) {
    const facilitatorId = this.normalizeFacilitatorId(id);
    this.assertTribeSelfOrSuperAdmin(req.user, facilitatorId);
    return this.usersService.getTribeMentoringSessions(facilitatorId);
  }

  /**
   * Get user by ID
   * GET /users/:id
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * Update user profile
   * PATCH /users/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserDtoSchema))
    updateUserDto: UpdateUserDto,
  ) {
    assertSuperAdminOnly(req.user, 'User update');
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Update user role (Admin only)
   * PATCH /users/:id/role
   */
  @Patch(':id/role')
  @UseGuards(JwtAuthGuard)
  updateRole(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserRoleDtoSchema))
    updateRoleDto: UpdateUserRoleDto,
  ) {
    assertSuperAdminOnly(req.user, 'User role update');
    return this.usersService.updateRole(id, updateRoleDto);
  }

  /**
   * Delete user (Admin only)
   * DELETE /users/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Req() req: { user: JwtUserPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    assertSuperAdminOnly(req.user, 'User deletion');
    return this.usersService.remove(id);
  }

  private requireSessionUserId(user: JwtUserPayload): string {
    const id = String(user?.sub ?? '').trim();
    if (!id) {
      throw new BadRequestException('Invalid session user id');
    }
    return id;
  }

  private normalizeFacilitatorId(raw: string): string {
    const id = String(raw ?? '').trim();
    if (!id) {
      throw new BadRequestException('Facilitator id is required');
    }
    return id;
  }

  private assertTribeSelfOrSuperAdmin(
    user: JwtUserPayload,
    facilitatorId: string,
  ): void {
    const role = parseAppRoleString(user?.role);
    if (role === USER_ROLE.SUPER_ADMIN) return;
    if (String(user?.sub ?? '').trim() === facilitatorId) return;
    throw new ForbiddenException(
      'You may only access your own tribe data',
    );
  }
}
