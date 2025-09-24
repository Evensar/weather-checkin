export type WeatherSymbolKey = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm';

export const WEATHER_SYMBOLS: Record<WeatherSymbolKey, { label: string; emoji: string }> = {
  sun: { label: 'Sol', emoji: '☀️' },
  partly: { label: 'Halvsol', emoji: '🌤️' },
  cloud: { label: 'Moln', emoji: '☁️' },
  rain: { label: 'Regn', emoji: '🌧️' },
  storm: { label: 'Åska', emoji: '⛈️' },
};

export const WEATHER_ORDER: WeatherSymbolKey[] = ['sun', 'partly', 'cloud', 'rain', 'storm'];



