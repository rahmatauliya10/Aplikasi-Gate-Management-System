import { IsOptional, IsString } from 'class-validator';

export class StartProcessDto {
  @IsOptional()
  @IsString()
  suratJalanNumber?: string;

  @IsOptional()
  @IsString()
  poNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
