import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  constructor() {}

  @Get()
  getHello() {
    return {
      success: true,
      message: "Welcome to Gate Management System API",
      documentation: "/api/docs",
      health: "/api/health"
    };
  }

  @Get('health')
  getHealth() {
    return {
      success: true,
      message: "GMS backend is running",
      data: {
        status: "ok"
      }
    };
  }
}
