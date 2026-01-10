import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    public command: string,
    public originalError: unknown
  ) {
    const message =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);
    super(`API Error (${command}): ${message}`);
    this.name = "ApiError";
  }
}

/**
 * Zod 验证错误类
 */
export class ApiValidationError extends Error {
  constructor(public zodError: z.ZodError) {
    super(`Validation Error: ${zodError.message}`);
    this.name = "ApiValidationError";
  }
}

/**
 * 统一的 API 调用封装
 *
 * 提供类型安全的 invoke 调用，支持 Zod 验证
 *
 * @example
 * const data = await apiCall("get_dashboard", undefined, dashboardSchema);
 */
export async function apiCall<T>(
  command: string,
  params?: Record<string, unknown>,
  schema?: z.ZodSchema<T>
): Promise<T> {
  try {
    const raw = await invoke(command, params);
    if (schema) {
      return schema.parse(raw);
    }
    return raw as T;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ApiValidationError(err);
    }
    throw new ApiError(command, err);
  }
}

/**
 * 无返回值的 API 调用
 */
export async function apiCallVoid(
  command: string,
  params?: Record<string, unknown>
): Promise<void> {
  try {
    await invoke(command, params);
  } catch (err) {
    throw new ApiError(command, err);
  }
}

/**
 * 返回数组的 API 调用
 */
export async function apiCallArray<T>(
  command: string,
  schema: z.ZodSchema<T>,
  params?: Record<string, unknown>
): Promise<T[]> {
  return apiCall(command, params, z.array(schema));
}

// Re-export invoke for cases that need direct access
export { invoke };
