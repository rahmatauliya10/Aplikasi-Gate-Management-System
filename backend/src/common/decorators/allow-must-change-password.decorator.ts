import { SetMetadata } from '@nestjs/common';

export const IS_ALLOW_MUST_CHANGE_PASSWORD_KEY = 'isAllowMustChangePassword';
export const AllowMustChangePassword = () =>
  SetMetadata(IS_ALLOW_MUST_CHANGE_PASSWORD_KEY, true);
