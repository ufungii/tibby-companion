import { Platform } from 'react-native';

export const theme = {
  background: '#0A0E1A',
  surface: '#111827',
  text: '#E8ECF5',
  muted: '#A2AFC4',
  accent: '#48CFC2',
  ink: '#071B20',
  border: '#2C374B',
  disabled: '#1C2637',
  error: '#FFB4BC',
  font: Platform.select({
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    ios: 'System',
    android: 'sans-serif',
  }),
};
