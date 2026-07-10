import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, IsArray, Matches } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, { message: 'Username must be lowercase, alphanumeric, or underscores, and contain no spaces' })
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['ADMIN', 'SECURITY', 'WAREHOUSE', 'QC'])
  role: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warehouseAccess?: string[];
}
