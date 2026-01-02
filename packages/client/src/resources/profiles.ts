/**
 * Profiles Resource API
 */

import type { ProfileSummary, ProfileDetail, CreateProfileOptions } from '../types.js';

export interface ProfilesListResponse {
  items: ProfileSummary[];
  total: number;
}

export interface ProfileUpdateResponse {
  name: string;
  message: string;
}

export interface ProfileDeleteResponse {
  name: string;
  message: string;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  resolved?: ProfileDetail;
}

export type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Profiles resource methods
 */
export class ProfilesResource {
  constructor(private request: RequestFn) {}

  /**
   * List all profiles
   */
  async list(): Promise<ProfilesListResponse> {
    return this.request('GET', '/api/v1/profiles');
  }

  /**
   * Get profile by name
   * @param name Profile name
   * @param resolve If true, resolve the full inheritance chain
   */
  async get(name: string, resolve = false): Promise<ProfileDetail> {
    const params: Record<string, string> = {};
    if (resolve) params.resolve = 'true';
    return this.request('GET', `/api/v1/profiles/${name}`, { params });
  }

  /**
   * Create a new profile
   */
  async create(options: CreateProfileOptions): Promise<ProfileSummary> {
    return this.request('POST', '/api/v1/profiles', { body: options });
  }

  /**
   * Update an existing profile
   */
  async update(
    name: string,
    options: Partial<Omit<CreateProfileOptions, 'name'>>
  ): Promise<ProfileUpdateResponse> {
    return this.request('PUT', `/api/v1/profiles/${name}`, { body: options });
  }

  /**
   * Delete a profile
   */
  async delete(name: string): Promise<ProfileDeleteResponse> {
    return this.request('DELETE', `/api/v1/profiles/${name}`);
  }

  /**
   * Validate a profile configuration
   */
  async validate(name: string): Promise<ProfileValidationResult> {
    return this.request('POST', `/api/v1/profiles/${name}/validate`);
  }
}
