export interface DockerTagImage {
  architecture: string;
  features?: string;
  variant?: string;
  digest: string;
  os: string;
  os_features?: string;
  os_version?: string;
  size: number;
  status: string;
  last_pulled?: string;
  last_pushed?: string;
}

//#########################//

export interface DockerTag {
  creator: number;
  id: number;
  images: DockerTagImage[];
  last_updated: string;
  last_updater: number;
  last_updater_username: string;
  name: string;
  repository: number;
  full_size: number;
  v2: boolean;
  tag_status: string;
  tag_last_pulled?: string;
  tag_last_pushed?: string;
  media_type?: string;
  content_type?: string;
  digest?: string;
}

//#########################//

export interface DockerTagsResponse {
  count: number;
  next?: string;
  previous?: string;
  results: DockerTag[];
}

//#########################//