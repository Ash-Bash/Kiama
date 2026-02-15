export interface Theme {
  name: string;
  modes: {
    light: { colors: Record<string, string> };
    dark: { colors: Record<string, string> };
  };
}