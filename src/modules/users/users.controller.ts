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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new user (Admin only)
   * POST /users
   */
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateUserDtoSchema))
    createUserDto: CreateUserDto,
  ) {
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
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserDtoSchema))
    updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Update user role (Admin only)
   * PATCH /users/:id/role
   */
  @Patch(':id/role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserRoleDtoSchema))
    updateRoleDto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(id, updateRoleDto);
  }

  /**
   * Delete user (Admin only)
   * DELETE /users/:id
   */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
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
