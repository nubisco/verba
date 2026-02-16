import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface Namespace {
  id: string;
  name: string;
  description?: string;
}

export interface Locale {
  id: string;
  code: string;
  name: string;
}

export interface Key {
  id: string;
  key: string;
  description?: string;
  translations?: Translation[];
}

export interface Translation {
  id: string;
  value: string;
  state: 'TODO' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED';
  locale: Locale;
}

export interface Comment {
  id: string;
  content: string;
  user: User;
  createdAt: string;
}

export const authService = {
  async register(email: string, name: string, password: string) {
    const response = await api.post('/auth/register', { email, name, password });
    localStorage.setItem('token', response.data.token);
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', response.data.token);
    return response.data;
  },

  logout() {
    localStorage.removeItem('token');
  },

  isAuthenticated() {
    return !!localStorage.getItem('token');
  },
};

export const projectService = {
  async list() {
    const response = await api.get('/projects');
    return response.data.projects;
  },

  async create(name: string, description?: string) {
    const response = await api.post('/projects', { name, description });
    return response.data.project;
  },

  async get(id: string) {
    const response = await api.get(`/projects/${id}`);
    return response.data.project;
  },

  async addMember(projectId: string, userId: string, role: string) {
    const response = await api.post(`/projects/${projectId}/members`, { userId, role });
    return response.data.member;
  },
};

export const namespaceService = {
  async list(projectId: string) {
    const response = await api.get(`/projects/${projectId}/namespaces`);
    return response.data.namespaces;
  },

  async create(projectId: string, name: string, description?: string) {
    const response = await api.post(`/projects/${projectId}/namespaces`, { name, description });
    return response.data.namespace;
  },

  async get(id: string) {
    const response = await api.get(`/namespaces/${id}`);
    return response.data.namespace;
  },

  async addAccess(namespaceId: string, userId: string, role: string) {
    const response = await api.post(`/namespaces/${namespaceId}/access`, { userId, role });
    return response.data.access;
  },
};

export const localeService = {
  async list(projectId: string) {
    const response = await api.get(`/projects/${projectId}/locales`);
    return response.data.locales;
  },

  async create(projectId: string, code: string, name: string) {
    const response = await api.post(`/projects/${projectId}/locales`, { code, name });
    return response.data.locale;
  },
};

export const keyService = {
  async list(namespaceId: string) {
    const response = await api.get(`/namespaces/${namespaceId}/keys`);
    return response.data.keys;
  },

  async create(namespaceId: string, key: string, description?: string) {
    const response = await api.post(`/namespaces/${namespaceId}/keys`, { key, description });
    return response.data.key;
  },

  async get(id: string) {
    const response = await api.get(`/keys/${id}`);
    return response.data.key;
  },
};

export const translationService = {
  async create(keyId: string, localeId: string, value: string) {
    const response = await api.post(`/keys/${keyId}/translations`, { localeId, value });
    return response.data.translation;
  },

  async update(id: string, value?: string, state?: string) {
    const response = await api.patch(`/translations/${id}`, { value, state });
    return response.data.translation;
  },
};

export const commentService = {
  async list(translationId: string) {
    const response = await api.get(`/translations/${translationId}/comments`);
    return response.data.comments;
  },

  async create(translationId: string, content: string) {
    const response = await api.post(`/translations/${translationId}/comments`, { content });
    return response.data.comment;
  },
};

export const importExportService = {
  async import(projectId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/projects/${projectId}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async export(projectId: string) {
    const response = await api.get(`/projects/${projectId}/export`);
    return response.data;
  },
};
