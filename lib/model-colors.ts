// Model color utility for consistent theming across the app

export interface ModelTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  bg: string;
  border: string;
  ring: string;
}

// Hash function for consistent color assignment
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

const colorThemes: ModelTheme[] = [
  {
    primary: '#EF4444',
    secondary: '#FEF2F2',
    accent: '#FCA5A5',
    text: '#B91C1C',
    bg: '#FEF2F2',
    border: '#FECACA',
    ring: '#EF4444'
  },
  {
    primary: '#3B82F6',
    secondary: '#EFF6FF',
    accent: '#93C5FD',
    text: '#1D4ED8',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    ring: '#3B82F6'
  },
  {
    primary: '#10B981',
    secondary: '#F0FDF4',
    accent: '#6EE7B7',
    text: '#047857',
    bg: '#F0FDF4',
    border: '#BBF7D0',
    ring: '#10B981'
  },
  {
    primary: '#F59E0B',
    secondary: '#FFFBEB',
    accent: '#FCD34D',
    text: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    ring: '#F59E0B'
  },
  {
    primary: '#8B5CF6',
    secondary: '#FAF5FF',
    accent: '#C4B5FD',
    text: '#7C3AED',
    bg: '#FAF5FF',
    border: '#DDD6FE',
    ring: '#8B5CF6'
  },
  {
    primary: '#EC4899',
    secondary: '#FDF2F8',
    accent: '#F9A8D4',
    text: '#DB2777',
    bg: '#FDF2F8',
    border: '#FBCFE8',
    ring: '#EC4899'
  },
  {
    primary: '#6366F1',
    secondary: '#F5F3FF',
    accent: '#A5B4FC',
    text: '#4F46E5',
    bg: '#F5F3FF',
    border: '#C7D2FE',
    ring: '#6366F1'
  },
  {
    primary: '#06B6D4',
    secondary: '#F0F9FF',
    accent: '#67E8F9',
    text: '#0891B2',
    bg: '#F0F9FF',
    border: '#B3F5FC',
    ring: '#06B6D4'
  },
  {
    primary: '#F97316',
    secondary: '#FFF7ED',
    accent: '#FDBA74',
    text: '#EA580C',
    bg: '#FFF7ED',
    border: '#FED7AA',
    ring: '#F97316'
  },
  {
    primary: '#84CC16',
    secondary: '#F7FEE7',
    accent: '#BEF264',
    text: '#65A30D',
    bg: '#F7FEE7',
    border: '#D9F99D',
    ring: '#84CC16'
  }
];

export function getModelTheme(modelName: string): ModelTheme {
  if (!modelName) {
    return colorThemes[0]; // Default theme
  }
  
  const hash = hashCode(modelName);
  const themeIndex = hash % colorThemes.length;
  return colorThemes[themeIndex];
}

export function getModelDisplayName(modelName: string): string {
  if (!modelName) return 'Unknown Model';
  
  // Clean up model names for display
  const cleanName = modelName
    .replace(/^(openai|google|anthropic|meta-llama|qwen|deepseek|mistralai|amazon|nvidia|microsoft|x-ai|perplexity|01-ai)\//, '')
    .replace(/:free$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
    
  return cleanName;
}

export function getModelCompany(modelName: string): string {
  if (!modelName) return 'Unknown';
  
  if (modelName.startsWith('openai/')) return 'OpenAI';
  if (modelName.startsWith('google/')) return 'Google';
  if (modelName.startsWith('anthropic/')) return 'Anthropic';
  if (modelName.startsWith('meta-llama/')) return 'Meta';
  if (modelName.startsWith('qwen/')) return 'Qwen';
  if (modelName.startsWith('deepseek/')) return 'DeepSeek';
  if (modelName.startsWith('mistralai/')) return 'Mistral';
  if (modelName.startsWith('amazon/')) return 'Amazon';
  if (modelName.startsWith('nvidia/')) return 'NVIDIA';
  if (modelName.startsWith('microsoft/')) return 'Microsoft';
  if (modelName.startsWith('x-ai/')) return 'xAI';
  if (modelName.startsWith('perplexity/')) return 'Perplexity';
  if (modelName.startsWith('01-ai/')) return '01.AI';
  
  return 'Unknown';
}