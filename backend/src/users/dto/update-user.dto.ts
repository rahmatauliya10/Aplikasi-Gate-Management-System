import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
  IsArray,
  IsIn,
  Matches,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username must be lowercase, alphanumeric, or underscores, and contain no spaces',
  })
  username?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['ADMIN', 'SECURITY', 'WAREHOUSE', 'QC'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(['GBB', 'GBJ', 'GSP'], {
    each: true,
    message: 'Setiap akses gudang harus berupa salah satu dari: GBB, GBJ, GSP',
  })
  warehouseAccess?: string[];

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  site?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
