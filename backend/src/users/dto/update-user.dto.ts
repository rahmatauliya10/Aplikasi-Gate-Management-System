import { IsEmail, IsEnum, IsOptional, IsString, MinLength, IsBoolean, IsArray, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/, { message: 'Username must be lowercase, alphanumeric, or underscores, and contain no spaces' })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

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
  @IsString({ each: true })
  warehouseAccess?: string[];
}
