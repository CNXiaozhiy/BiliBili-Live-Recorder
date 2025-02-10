import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry, { isNetworkError, isRetryableError } from 'axios-retry';
import logger from '../logger';

const instance: AxiosInstance = axios.create();

axiosRetry(instance, {
  retries: 3, // 最大重试次数
  retryDelay: (retryCount: number) => {
    return retryCount * 1000;
  },
  retryCondition: (error: AxiosError) => {
    // 仅在网络错误或 5xx 错误时重试
    return isNetworkError(error) || isRetryableError(error);
  },
});

instance.interceptors.request.use((config: AxiosRequestConfig) => {
  // 设置默认的 User-Agent
  config.headers = config.headers || {}; // 确保 headers 存在
  config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
  // config.headers['Referer'] = 'https://www.bilibili.com';
  // config.headers['Origin'] = 'https://www.bilibili.com';
  return config;
});

export async function makeRequest<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  try {
    const response: AxiosResponse<T> = await instance(config);
    return response;
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
      logger.warn('Axios Request error, retry count:', i, error);
      err = error;
    }
  }
  throw err;
}