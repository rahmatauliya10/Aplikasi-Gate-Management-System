import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { ProductCatalogService } from './product-catalog.service';
import { CreateProductCatalogDto } from './dto/create-product-catalog.dto';
import { UpdateProductCatalogDto } from './dto/update-product-catalog.dto';
import { QueryProductCatalogDto } from './dto/query-product-catalog.dto';

@ApiTags('Product Catalog')
@ApiBearerAuth()
@Controller('product-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductCatalogController {
  constructor(private readonly productCatalogService: ProductCatalogService) {}

  @Get()
  @Roles('ADMIN', 'SECURITY', 'QC', 'WAREHOUSE')
  @ApiOperation({
    summary: 'Get product catalogs with optional processType and isActive filters',
  })
  @ApiResponse({ status: 200, description: 'List of product catalogs' })
  findAll(@Query() query: QueryProductCatalogDto) {
    return this.productCatalogService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'SECURITY', 'QC', 'WAREHOUSE')
  @ApiOperation({ summary: 'Get single product catalog by ID' })
  @ApiResponse({ status: 200, description: 'Product catalog details' })
  @ApiResponse({ status: 404, description: 'Product catalog not found' })
  findById(@Param('id') id: string) {
    return this.productCatalogService.findById(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create new product catalog (Admin only)' })
  @ApiResponse({ status: 201, description: 'Product catalog created' })
  @ApiResponse({ status: 400, description: 'Validation or invariant error' })
  @ApiResponse({ status: 409, description: 'Duplicate product code' })
  create(
    @Body() dto: CreateProductCatalogDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.productCatalogService.create(dto, user);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update product catalog (Admin only)' })
  @ApiResponse({ status: 200, description: 'Product catalog updated' })
  @ApiResponse({ status: 400, description: 'Validation or invariant error' })
  @ApiResponse({ status: 404, description: 'Product catalog not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductCatalogDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.productCatalogService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Delete product catalog or deactivate if referenced by transactions (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Product catalog deleted or deactivated' })
  @ApiResponse({ status: 404, description: 'Product catalog not found' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.productCatalogService.remove(id, user);
  }
}
