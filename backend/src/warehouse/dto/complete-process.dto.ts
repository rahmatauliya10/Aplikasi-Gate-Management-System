import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CompleteProcessDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  rollWeight?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
