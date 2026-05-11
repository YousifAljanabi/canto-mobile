export const colors = {
  ink: '#1a1a1a',
  ink2: '#5c5c5c',
  ink3: '#a8a8a8',
  paper: '#fbf9f3',
  accent: '#d96a2e',
  paperDark: '#f0eee9',
  white: '#ffffff',
};

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 12, color: colors.ink2 },
  tiny: { fontSize: 10, color: colors.ink3 },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
