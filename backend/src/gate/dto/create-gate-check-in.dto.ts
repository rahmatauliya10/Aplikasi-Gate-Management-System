import { IsNotEmpty, IsString, IsOptional, IsEnum, Matches, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ProcessType, CargoProcessType } from '@prisma/client';

export class CreateGateCheckInDto {
  @ApiProperty({ example: 'L1234AB', description: 'Vehicle plate number' })
  @IsString()
  @IsNotEmpty({ message: 'Plate number is required' })
  @Transform(({ value }) => value?.toUpperCase().replace(/\s+/g, ''))
  plateNumber: string;

  @ApiProperty({ example: 'Budi Santoso', description: 'Driver name' })
  @IsString()
  @IsNotEmpty({ message: 'Driver name is required' })
  driverName: string;

  @ApiProperty({ example: '081234567890', description: 'Driver phone number (10-13 digits)' })
  @IsString()
  @IsNotEmpty({ message: 'Driver phone is required' })
  @Matches(/^[0-9]+$/, { message: 'Driver phone must contain only numbers' })
  @Length(10, 13, { message: 'Driver phone must be 10 to 13 digits' })
  driverPhone: string;

  @ApiProperty({ example: 'PT Supplier Kopi', description: 'Vendor/Supplier name' })
  @IsString()
  @IsNotEmpty({ message: 'Vendor name is required' })
  vendorName: string;

  @ApiProperty({ example: 'TRUCK', description: 'Type of vehicle' })
  @IsString()
  @IsNotEmpty({ message: 'Vehicle type is required' })
  vehicleType: string;

  @ApiProperty({ enum: ProcessType, example: 'GBB', description: 'Target warehouse process (GBB, GBJ, GSP)' })
  @IsEnum(ProcessType, { message: 'Process type must be one of: GBB, GBJ, GSP' })
  @IsNotEmpty({ message: 'Process type is required' })
  processType: ProcessType;

  @ApiProperty({ example: 'Coffee Beans', description: 'Main cargo type' })
  @IsString()
  @IsNotEmpty({ message: 'Cargo type is required' })
  cargoType: string;

  @ApiProperty({ example: 'Robusta', description: 'Specific cargo subtype', required: false })
  @IsOptional()
  @IsString()
  cargoSubType?: string;

  @ApiProperty({ enum: CargoProcessType, example: 'INBOUND', description: 'Flow direction (INBOUND, OUTBOUND)' })
  @IsEnum(CargoProcessType, { message: 'Cargo process type must be INBOUND or OUTBOUND' })
  @IsNotEmpty({ message: 'Cargo process type is required' })
  cargoProcessType: CargoProcessType;

  @ApiProperty({ example: 'SJ-001', required: false })
  @IsOptional()
  @IsString()
  suratJalanNumber?: string;

  @ApiProperty({ example: 'PO-001', required: false })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiProperty({ example: 'CARD-001', required: false })
  @IsOptional()
  @IsString()
  permitCardNumber?: string;

  @ApiProperty({ example: 'KTP-001', required: false })
  @IsOptional()
  @IsString()
  guestIdNumber?: string;

  @ApiProperty({ example: 'Kendaraan membawa kopi green bean', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
