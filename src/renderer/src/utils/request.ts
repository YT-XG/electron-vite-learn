import axios from 'axios'
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig
} from 'axios'

/**
 * 创建 axios 实例
 */
const service: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000
})

/**
 * 请求拦截器
 * - 可在此添加 token、签名等认证信息
 */
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 示例：添加 token
    // const token = localStorage.getItem('token')
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 * - 统一处理响应数据和错误
 */
service.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error) => {
    // 统一错误处理
    const message = error.response?.data?.message || error.message || '请求失败'
    console.error('[HTTP Error]', message)
    return Promise.reject(error)
  }
)

/**
 * 封装的 HTTP 请求方法
 */
const http = {
  /**
   * GET 请求
   * @param url - 请求地址
   * @param params - 查询参数
   * @param config - 额外配置
   */
  get<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return service.get(url, { params, ...config })
  },

  /**
   * POST 请求
   * @param url - 请求地址
   * @param data - 请求体数据
   * @param config - 额外配置
   */
  post<T = unknown>(
    url: string,
    data?: Record<string, unknown>,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return service.post(url, data, config)
  },

  /**
   * PUT 请求
   * @param url - 请求地址
   * @param data - 请求体数据
   * @param config - 额外配置
   */
  put<T = unknown>(
    url: string,
    data?: Record<string, unknown>,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return service.put(url, data, config)
  },

  /**
   * DELETE 请求
   * @param url - 请求地址
   * @param params - 查询参数
   * @param config - 额外配置
   */
  delete<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return service.delete(url, { params, ...config })
  },

  /**
   * PATCH 请求
   * @param url - 请求地址
   * @param data - 请求体数据
   * @param config - 额外配置
   */
  patch<T = unknown>(
    url: string,
    data?: Record<string, unknown>,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return service.patch(url, data, config)
  }
}

export default http
