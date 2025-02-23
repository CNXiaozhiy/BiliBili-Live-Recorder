import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry, { isNetworkError, isRetryableError } from 'axios-retry';
import throttledQueue from 'throttled-queue';
import logger from '../logger';

// 限流器
const throttle = throttledQueue(5, 1000);

const instance: AxiosInstance = axios.create();

axiosRetry(instance, {
  retries: 3, // 最大重试次数
  retryDelay: (retryCount: number) => {
    return retryCount * 1000;
  },
  retryCondition: (error: AxiosError) => {
    return (
      isNetworkError(error) ||
      isRetryableError(error) ||
      (error.response?.status === 429)
    );
  },
});

instance.interceptors.request.use(async (config: AxiosRequestConfig) => {
  config.headers = config.headers || {}; // 确保 headers 存在

  !config.headers['No-Throttleo'] && await new Promise<void>(resolve => throttle(resolve)); 

  config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
  config.headers['Referer'] = config.headers['Referer'] || 'https://www.bilibili.com';
  config.headers['Origin'] = config.headers['Origin'] || 'https://www.bilibili.com';

  config.timeout = config.timeout || 60000;
  return config;
});

export async function makeRequest<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  try {
    return await instance(config);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.warn('Axios error:', error);
    } else {
      logger.warn('Non-Axios error:', error);
    }
    throw error;
  }
}

export async function makeRequestRetry<T>(config: AxiosRequestConfig, retryCount: number = 3): Promise<AxiosResponse<T>> {
  let err;
  for (let i = 1; i <= retryCount; i++) {
    try {
      return await makeRequest(config);
    } catch (error) {
      logger.warn(`Request failed, retry ${i}/${retryCount}`, error);
      err = error;
    }
  }
  throw err;
}