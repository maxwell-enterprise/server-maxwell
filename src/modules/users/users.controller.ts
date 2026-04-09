/**
 * MAXWELL ERP - Users Controller
 */

import {
  Controller,
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

  /**
   * Get facilitator's downline
   * GET /users/:id/downline
   */
  @Get(':id/downline')
  getDownline(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getDownline(id);
  }
}
