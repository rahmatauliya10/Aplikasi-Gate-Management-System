import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SubmitWeightDto {
  @IsNumber()
  @Min(0)
  weight: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
