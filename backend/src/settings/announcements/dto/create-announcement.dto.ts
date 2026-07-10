import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
import { AnnouncementType, AnnouncementStatus, AnnouncementLocation, AnnouncementSpeed, AnnouncementPriority } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ enum: AnnouncementType, default: AnnouncementType.INFO })
  @IsEnum(AnnouncementType)
  @IsOptional()
  type?: AnnouncementType;

  @ApiProperty({ enum: AnnouncementStatus, default: AnnouncementStatus.ACTIVE })
  @IsEnum(AnnouncementStatus)
  @IsOptional()
  status?: AnnouncementStatus;

  @ApiProperty({ enum: AnnouncementLocation, default: AnnouncementLocation.ALL_PAGES })
  @IsEnum(AnnouncementLocation)
  @IsOptional()
  location?: AnnouncementLocation;

  @ApiProperty({ enum: AnnouncementSpeed, default: AnnouncementSpeed.NORMAL })
  @IsEnum(AnnouncementSpeed)
  @IsOptional()
  speed?: AnnouncementSpeed;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  textColor?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  backgroundColor?: string;

  @ApiProperty({ enum: AnnouncementPriority, default: AnnouncementPriority.MEDIUM })
  @IsEnum(AnnouncementPriority)
  @IsOptional()
  priority?: AnnouncementPriority;
}
