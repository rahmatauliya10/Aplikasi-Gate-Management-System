import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsString()
  @IsNotEmpty()
  driverName: string;

  @IsString()
  @IsNotEmpty()
  vendor: string;

  @IsEnum(['GBB', 'GBJ', 'GSP'])
  processType: string;

  @IsOptional()
  @IsString()
  cargoType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
