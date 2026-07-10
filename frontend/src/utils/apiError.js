import { getErrorMessage } from './errorMessage';

export const handleApiError = (error) => {
  const message = error.gmsMessage || getErrorMessage(error);
  const status = error.response?.status || 500;
  const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error'));

  return { message, status, isNetworkError };
};
